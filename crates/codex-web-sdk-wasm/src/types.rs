use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;

fn default_model() -> String {
    "gpt-5.1-codex".to_string()
}

fn default_max_tool_roundtrips() -> u32 {
    8
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default)]
    pub instructions: Option<String>,
    #[serde(default = "default_max_tool_roundtrips")]
    pub max_tool_roundtrips: u32,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            model: default_model(),
            instructions: None,
            max_tool_roundtrips: default_max_tool_roundtrips(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartTurnArgs {
    #[serde(default)]
    pub thread_id: Option<String>,
    pub prompt: String,
    #[serde(default)]
    pub tools: Vec<ToolDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartTurnResult {
    pub thread_id: String,
    pub is_new_thread: bool,
    pub request: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub call_id: String,
    pub name: String,
    #[serde(default)]
    pub output: Value,
    #[serde(default)]
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionRequest {
    pub id: String,
    pub call_id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Usage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub cached_input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TurnResolution {
    Completed {
        usage: Usage,
    },
    NeedsToolOutputs {
        tool_calls: Vec<ToolExecutionRequest>,
    },
    Failed {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ThreadItem {
    AgentMessage {
        id: String,
        text: String,
        status: ItemStatus,
    },
    ToolCall {
        id: String,
        call_id: String,
        name: String,
        arguments: String,
        status: ItemStatus,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Reasoning {
        id: String,
        text: String,
        status: ItemStatus,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RuntimeEvent {
    #[serde(rename = "item.started")]
    ItemStarted { item: ThreadItem },
    #[serde(rename = "item.updated")]
    ItemUpdated { item: ThreadItem },
    #[serde(rename = "item.completed")]
    ItemCompleted { item: ThreadItem },
    #[serde(rename = "text.delta")]
    TextDelta {
        item_id: String,
        delta: String,
        snapshot: String,
    },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResponsesStreamEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub response: Option<ResponseEnvelope>,
    #[serde(default)]
    pub item: Option<ResponseOutputItem>,
    #[serde(default)]
    pub item_id: Option<String>,
    #[serde(default)]
    pub delta: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
    #[serde(default)]
    pub error: Option<ResponseError>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResponseEnvelope {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub usage: Option<ResponseUsageEnvelope>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResponseUsageEnvelope {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    #[serde(default)]
    pub cached_input_tokens: Option<u64>,
    #[serde(default)]
    pub input_tokens_details: Option<InputTokensDetails>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InputTokensDetails {
    #[serde(default)]
    pub cached_tokens: u64,
}

impl ResponseUsageEnvelope {
    pub fn to_usage(&self) -> Usage {
        Usage {
            input_tokens: self.input_tokens,
            cached_input_tokens: self.cached_input_tokens.unwrap_or_else(|| {
                self.input_tokens_details
                    .as_ref()
                    .map_or(0, |value| value.cached_tokens)
            }),
            output_tokens: self.output_tokens,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResponseError {
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResponseOutputItem {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default)]
    pub item_type: String,
    #[serde(default)]
    pub call_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
    #[serde(default)]
    pub content: Vec<ResponseContentPart>,
    #[serde(default)]
    pub summary: Vec<ResponseContentPart>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ResponseContentPart {
    #[serde(rename = "type", default)]
    pub part_type: String,
    #[serde(default)]
    pub text: Option<String>,
}

impl ResponseOutputItem {
    pub fn content_text(&self) -> Option<String> {
        let text = self
            .content
            .iter()
            .filter_map(|part| {
                if part.part_type == "output_text" || part.part_type == "summary_text" {
                    part.text.clone()
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("");
        if text.is_empty() { None } else { Some(text) }
    }

    pub fn summary_text(&self) -> Option<String> {
        let text = self
            .summary
            .iter()
            .filter_map(|part| part.text.clone())
            .collect::<Vec<_>>()
            .join("");
        if text.is_empty() { None } else { Some(text) }
    }
}
