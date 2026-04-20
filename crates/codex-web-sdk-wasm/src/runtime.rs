use std::collections::HashMap;

use serde_json::Value;
use serde_json::json;
use uuid::Uuid;

use crate::error::Result;
use crate::error::RuntimeError;
use crate::types::ItemStatus;
use crate::types::ResponseOutputItem;
use crate::types::ResponsesStreamEvent;
use crate::types::RuntimeConfig;
use crate::types::RuntimeEvent;
use crate::types::StartTurnArgs;
use crate::types::StartTurnResult;
use crate::types::ThreadItem;
use crate::types::ToolDefinition;
use crate::types::ToolExecutionRequest;
use crate::types::ToolOutput;
use crate::types::TurnResolution;
use crate::types::Usage;

#[derive(Debug, Clone)]
struct ToolCallState {
    id: String,
    call_id: String,
    name: String,
    arguments: String,
}

#[derive(Debug, Default)]
struct ThreadState {
    last_response_id: Option<String>,
    tools: Vec<ToolDefinition>,
    tool_roundtrips: u32,
    usage: Option<Usage>,
    turn_failed: Option<String>,
    agent_messages: HashMap<String, String>,
    reasoning_items: HashMap<String, String>,
    pending_tool_calls: HashMap<String, ToolCallState>,
    ready_tool_calls: Vec<ToolExecutionRequest>,
}

impl ThreadState {
    fn clear_response_buffers(&mut self) {
        self.usage = None;
        self.turn_failed = None;
        self.agent_messages.clear();
        self.reasoning_items.clear();
        self.pending_tool_calls.clear();
        self.ready_tool_calls.clear();
    }
}

#[derive(Debug)]
pub struct Runtime {
    config: RuntimeConfig,
    threads: HashMap<String, ThreadState>,
}

impl Runtime {
    pub fn new(config: RuntimeConfig) -> Self {
        Self {
            config,
            threads: HashMap::new(),
        }
    }

    pub fn start_turn(&mut self, args: StartTurnArgs) -> Result<StartTurnResult> {
        let thread_id = args
            .thread_id
            .unwrap_or_else(|| format!("thread_{}", Uuid::new_v4()));
        let is_new_thread = !self.threads.contains_key(&thread_id);

        let thread = self.threads.entry(thread_id.clone()).or_default();

        thread.clear_response_buffers();
        thread.tools = args.tools;
        thread.tool_roundtrips = 0;

        let request = build_request(
            &self.config,
            thread.last_response_id.as_deref(),
            json!([
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": args.prompt,
                        }
                    ],
                }
            ]),
            &thread.tools,
        );

        Ok(StartTurnResult {
            thread_id,
            is_new_thread,
            request,
        })
    }

    pub fn ingest_stream_event(
        &mut self,
        thread_id: &str,
        event: ResponsesStreamEvent,
    ) -> Result<Vec<RuntimeEvent>> {
        let thread = self.thread_mut(thread_id)?;
        let mut emitted = Vec::new();

        match event.event_type.as_str() {
            "response.output_item.added" => {
                if let Some(item) = event.item {
                    emitted.extend(handle_output_item_added(thread, item));
                }
            }
            "response.output_text.delta" => {
                let item_id = event.item_id.ok_or(RuntimeError::MissingField("item_id"))?;
                let delta = event.delta.unwrap_or_default();
                let snapshot = thread.agent_messages.entry(item_id.clone()).or_default();
                snapshot.push_str(&delta);
                emitted.push(RuntimeEvent::TextDelta {
                    item_id: item_id.clone(),
                    delta: delta.clone(),
                    snapshot: snapshot.clone(),
                });
                emitted.push(RuntimeEvent::ItemUpdated {
                    item: ThreadItem::AgentMessage {
                        id: item_id,
                        text: snapshot.clone(),
                        status: ItemStatus::InProgress,
                    },
                });
            }
            "response.output_text.done" => {
                let item_id = event.item_id.ok_or(RuntimeError::MissingField("item_id"))?;
                let final_text = event.text.unwrap_or_default();
                thread
                    .agent_messages
                    .insert(item_id.clone(), final_text.clone());
                emitted.push(RuntimeEvent::ItemUpdated {
                    item: ThreadItem::AgentMessage {
                        id: item_id,
                        text: final_text,
                        status: ItemStatus::InProgress,
                    },
                });
            }
            "response.reasoning_summary_text.delta" | "response.reasoning_text.delta" => {
                let item_id = event.item_id.ok_or(RuntimeError::MissingField("item_id"))?;
                let delta = event.delta.unwrap_or_default();
                let snapshot = thread.reasoning_items.entry(item_id.clone()).or_default();
                snapshot.push_str(&delta);
                emitted.push(RuntimeEvent::ItemUpdated {
                    item: ThreadItem::Reasoning {
                        id: item_id,
                        text: snapshot.clone(),
                        status: ItemStatus::InProgress,
                    },
                });
            }
            "response.reasoning_summary_text.done" | "response.reasoning_text.done" => {
                let item_id = event.item_id.ok_or(RuntimeError::MissingField("item_id"))?;
                let final_text = event.text.unwrap_or_default();
                thread
                    .reasoning_items
                    .insert(item_id.clone(), final_text.clone());
                emitted.push(RuntimeEvent::ItemUpdated {
                    item: ThreadItem::Reasoning {
                        id: item_id,
                        text: final_text,
                        status: ItemStatus::InProgress,
                    },
                });
            }
            "response.function_call_arguments.delta" => {
                let item_id = event.item_id.ok_or(RuntimeError::MissingField("item_id"))?;
                let delta = event.delta.unwrap_or_default();
                if let Some(tool_call) = thread.pending_tool_calls.get_mut(&item_id) {
                    tool_call.arguments.push_str(&delta);
                    emitted.push(RuntimeEvent::ItemUpdated {
                        item: tool_call_item(tool_call, ItemStatus::InProgress, None, None),
                    });
                }
            }
            "response.function_call_arguments.done" => {
                let item_id = event.item_id.ok_or(RuntimeError::MissingField("item_id"))?;
                let final_arguments = event.arguments.unwrap_or_default();
                if let Some(tool_call) = thread.pending_tool_calls.get_mut(&item_id) {
                    tool_call.arguments = final_arguments;
                    emitted.push(RuntimeEvent::ItemUpdated {
                        item: tool_call_item(tool_call, ItemStatus::InProgress, None, None),
                    });
                }
            }
            "response.output_item.done" => {
                if let Some(item) = event.item {
                    emitted.extend(handle_output_item_done(thread, item));
                }
            }
            "response.completed" => {
                if let Some(response) = event.response {
                    thread.last_response_id = Some(response.id);
                    thread.usage = response.usage.map(|value| value.to_usage());
                    thread.turn_failed = None;
                }
            }
            "response.failed" => {
                let message = event
                    .error
                    .map(|value| value.message)
                    .unwrap_or_else(|| "response failed".to_string());
                thread.turn_failed = Some(message);
            }
            _ => {}
        }

        Ok(emitted)
    }

    pub fn complete_response(&mut self, thread_id: &str) -> Result<TurnResolution> {
        let max_tool_roundtrips = self.config.max_tool_roundtrips;
        let thread = self.thread_mut(thread_id)?;

        if let Some(message) = thread.turn_failed.take() {
            thread.clear_response_buffers();
            return Ok(TurnResolution::Failed { message });
        }

        if !thread.ready_tool_calls.is_empty() {
            if thread.tool_roundtrips >= max_tool_roundtrips {
                thread.clear_response_buffers();
                return Ok(TurnResolution::Failed {
                    message: format!("maximum tool roundtrips exceeded ({})", max_tool_roundtrips),
                });
            }

            return Ok(TurnResolution::NeedsToolOutputs {
                tool_calls: thread.ready_tool_calls.clone(),
            });
        }

        let usage = thread.usage.clone().unwrap_or_default();
        thread.clear_response_buffers();
        Ok(TurnResolution::Completed { usage })
    }

    pub fn submit_tool_outputs(
        &mut self,
        thread_id: &str,
        outputs: Vec<ToolOutput>,
    ) -> Result<Value> {
        let config = self.config.clone();
        let thread = self.thread_mut(thread_id)?;
        let previous_response_id = thread
            .last_response_id
            .clone()
            .ok_or(RuntimeError::MissingResponseId)?;

        thread.tool_roundtrips += 1;
        thread.clear_response_buffers();

        let tool_inputs = outputs
            .into_iter()
            .map(|output| {
                json!({
                    "type": "function_call_output",
                    "call_id": output.call_id,
                    "output": normalize_tool_output(output.output, output.is_error),
                })
            })
            .collect::<Vec<_>>();

        Ok(build_request(
            &config,
            Some(previous_response_id.as_str()),
            Value::Array(tool_inputs),
            &thread.tools,
        ))
    }

    fn thread_mut(&mut self, thread_id: &str) -> Result<&mut ThreadState> {
        self.threads
            .get_mut(thread_id)
            .ok_or_else(|| RuntimeError::ThreadNotFound(thread_id.to_string()))
    }
}

fn build_request(
    config: &RuntimeConfig,
    previous_response_id: Option<&str>,
    input: Value,
    tools: &[ToolDefinition],
) -> Value {
    let mut body = json!({
        "model": config.model,
        "stream": true,
        "input": input,
        "tools": tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                })
            })
            .collect::<Vec<_>>(),
    });

    if let Some(instructions) = &config.instructions {
        body["instructions"] = json!(instructions);
    }

    if let Some(previous_response_id) = previous_response_id {
        body["previous_response_id"] = json!(previous_response_id);
    }

    body
}

fn handle_output_item_added(
    thread: &mut ThreadState,
    item: ResponseOutputItem,
) -> Vec<RuntimeEvent> {
    match item.item_type.as_str() {
        "message" => {
            let text = item.content_text().unwrap_or_default();
            thread.agent_messages.insert(item.id.clone(), text.clone());
            vec![RuntimeEvent::ItemStarted {
                item: ThreadItem::AgentMessage {
                    id: item.id,
                    text,
                    status: ItemStatus::InProgress,
                },
            }]
        }
        "function_call" => {
            let tool_call = ToolCallState {
                id: item.id.clone(),
                call_id: item.call_id.unwrap_or_else(|| item.id.clone()),
                name: item.name.unwrap_or_default(),
                arguments: item.arguments.unwrap_or_default(),
            };
            thread
                .pending_tool_calls
                .insert(tool_call.id.clone(), tool_call.clone());
            vec![RuntimeEvent::ItemStarted {
                item: tool_call_item(&tool_call, ItemStatus::InProgress, None, None),
            }]
        }
        "reasoning" => {
            let text = item.summary_text().unwrap_or_default();
            thread.reasoning_items.insert(item.id.clone(), text.clone());
            vec![RuntimeEvent::ItemStarted {
                item: ThreadItem::Reasoning {
                    id: item.id,
                    text,
                    status: ItemStatus::InProgress,
                },
            }]
        }
        _ => Vec::new(),
    }
}

fn handle_output_item_done(
    thread: &mut ThreadState,
    item: ResponseOutputItem,
) -> Vec<RuntimeEvent> {
    match item.item_type.as_str() {
        "message" => {
            let final_text = item
                .content_text()
                .or_else(|| thread.agent_messages.get(&item.id).cloned())
                .unwrap_or_default();
            thread
                .agent_messages
                .insert(item.id.clone(), final_text.clone());
            vec![RuntimeEvent::ItemCompleted {
                item: ThreadItem::AgentMessage {
                    id: item.id,
                    text: final_text,
                    status: ItemStatus::Completed,
                },
            }]
        }
        "function_call" => {
            let tool_call = thread
                .pending_tool_calls
                .entry(item.id.clone())
                .or_insert_with(|| ToolCallState {
                    id: item.id.clone(),
                    call_id: item.call_id.clone().unwrap_or_else(|| item.id.clone()),
                    name: item.name.clone().unwrap_or_default(),
                    arguments: item.arguments.clone().unwrap_or_default(),
                });

            if let Some(arguments) = item.arguments {
                tool_call.arguments = arguments;
            }

            let queued_call = ToolExecutionRequest {
                id: tool_call.id.clone(),
                call_id: tool_call.call_id.clone(),
                name: tool_call.name.clone(),
                arguments: tool_call.arguments.clone(),
            };

            if !thread
                .ready_tool_calls
                .iter()
                .any(|existing| existing.call_id == queued_call.call_id)
            {
                thread.ready_tool_calls.push(queued_call);
            }

            vec![RuntimeEvent::ItemUpdated {
                item: tool_call_item(tool_call, ItemStatus::InProgress, None, None),
            }]
        }
        "reasoning" => {
            let final_text = item
                .summary_text()
                .or_else(|| thread.reasoning_items.get(&item.id).cloned())
                .unwrap_or_default();
            thread
                .reasoning_items
                .insert(item.id.clone(), final_text.clone());
            vec![RuntimeEvent::ItemCompleted {
                item: ThreadItem::Reasoning {
                    id: item.id,
                    text: final_text,
                    status: ItemStatus::Completed,
                },
            }]
        }
        _ => Vec::new(),
    }
}

fn tool_call_item(
    tool_call: &ToolCallState,
    status: ItemStatus,
    result: Option<Value>,
    error: Option<String>,
) -> ThreadItem {
    ThreadItem::ToolCall {
        id: tool_call.id.clone(),
        call_id: tool_call.call_id.clone(),
        name: tool_call.name.clone(),
        arguments: tool_call.arguments.clone(),
        status,
        result,
        error,
    }
}

fn normalize_tool_output(output: Value, is_error: bool) -> Value {
    if output.is_string() && !is_error {
        output
    } else if is_error {
        json!({
            "error": output,
        })
    } else {
        Value::String(output.to_string())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::Runtime;
    use crate::types::ResponsesStreamEvent;
    use crate::types::RuntimeConfig;
    use crate::types::StartTurnArgs;
    use crate::types::ToolDefinition;
    use crate::types::ToolOutput;
    use crate::types::TurnResolution;

    #[test]
    fn start_turn_uses_previous_response_id_on_later_turns() {
        let mut runtime = Runtime::new(RuntimeConfig::default());
        let started = runtime
            .start_turn(StartTurnArgs {
                thread_id: None,
                prompt: "First".to_string(),
                tools: Vec::new(),
            })
            .expect("first turn should start");

        runtime
            .ingest_stream_event(
                &started.thread_id,
                serde_json::from_value::<ResponsesStreamEvent>(json!({
                    "type": "response.completed",
                    "response": {
                        "id": "resp_1",
                        "usage": {
                            "input_tokens": 10,
                            "output_tokens": 20,
                            "input_tokens_details": {
                                "cached_tokens": 4
                            }
                        }
                    }
                }))
                .expect("event should deserialize"),
            )
            .expect("event should be accepted");

        assert!(matches!(
            runtime.complete_response(&started.thread_id),
            Ok(TurnResolution::Completed { .. })
        ));

        let next = runtime
            .start_turn(StartTurnArgs {
                thread_id: Some(started.thread_id.clone()),
                prompt: "Second".to_string(),
                tools: Vec::new(),
            })
            .expect("second turn should start");

        assert_eq!(next.request["previous_response_id"], "resp_1");
    }

    #[test]
    fn tool_outputs_continue_the_turn() {
        let mut runtime = Runtime::new(RuntimeConfig::default());
        let started = runtime
            .start_turn(StartTurnArgs {
                thread_id: None,
                prompt: "Use a tool".to_string(),
                tools: vec![ToolDefinition {
                    name: "lookup".to_string(),
                    description: Some("Looks up data".to_string()),
                    input_schema: json!({
                        "type": "object",
                    }),
                }],
            })
            .expect("turn should start");

        for event in [
            json!({
                "type": "response.output_item.added",
                "item": {
                    "id": "fc_1",
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "lookup"
                }
            }),
            json!({
                "type": "response.function_call_arguments.done",
                "item_id": "fc_1",
                "arguments": "{\"topic\":\"sdk\"}"
            }),
            json!({
                "type": "response.output_item.done",
                "item": {
                    "id": "fc_1",
                    "type": "function_call",
                    "call_id": "call_1",
                    "name": "lookup",
                    "arguments": "{\"topic\":\"sdk\"}"
                }
            }),
            json!({
                "type": "response.completed",
                "response": {
                    "id": "resp_2",
                    "usage": {
                        "input_tokens": 2,
                        "output_tokens": 2
                    }
                }
            }),
        ] {
            runtime
                .ingest_stream_event(
                    &started.thread_id,
                    serde_json::from_value::<ResponsesStreamEvent>(event)
                        .expect("event should deserialize"),
                )
                .expect("event should be accepted");
        }

        let resolution = runtime
            .complete_response(&started.thread_id)
            .expect("turn should resolve");

        let TurnResolution::NeedsToolOutputs { tool_calls } = resolution else {
            panic!("expected tool call resolution");
        };
        assert_eq!(tool_calls.len(), 1);

        let request = runtime
            .submit_tool_outputs(
                &started.thread_id,
                vec![ToolOutput {
                    call_id: "call_1".to_string(),
                    name: "lookup".to_string(),
                    output: json!({
                        "result": "ok"
                    }),
                    is_error: false,
                }],
            )
            .expect("tool output request should build");

        assert_eq!(request["previous_response_id"], "resp_2");
        assert_eq!(request["input"][0]["type"], "function_call_output");
    }
}
