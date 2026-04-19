import { AsyncQueue } from "./asyncQueue";
import { RuntimeBridge, ensureWasmInitialized } from "./runtime";
import { createFetchTransport } from "./transport";
import type {
  AgentOptions,
  ItemCompletedEvent,
  RunOptions,
  RunResult,
  StreamedRunResult,
  ThreadEvent,
  ThreadItem,
  ThreadOptions,
  ToolDefinition
} from "./types";

function toolMetadata(tools: ToolDefinition[]): Array<{
  name: string;
  description?: string;
  inputSchema?: unknown;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

function parseToolArguments(argumentsText: string): unknown {
  try {
    return JSON.parse(argumentsText);
  } catch {
    return argumentsText;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class CodexWeb {
  constructor(private readonly options: AgentOptions = {}) {}

  startThread(threadOptions: ThreadOptions = {}): Thread {
    return new Thread(this.options, threadOptions);
  }
}

export class Thread {
  private runtime: RuntimeBridge | null = null;
  private readonly transport;
  private threadId: string | null = null;

  constructor(
    private readonly agentOptions: AgentOptions,
    private readonly threadOptions: ThreadOptions
  ) {
    this.transport = agentOptions.transport ?? createFetchTransport(agentOptions);
  }

  get id(): string | null {
    return this.threadId;
  }

  async runStreamed(prompt: string, runOptions: RunOptions = {}): Promise<StreamedRunResult> {
    await ensureWasmInitialized(this.agentOptions.wasmUrl);
    if (!this.runtime) {
      this.runtime = new RuntimeBridge({
        model: this.agentOptions.model,
        instructions: this.agentOptions.instructions,
        maxToolRoundtrips: this.agentOptions.maxToolRoundtrips
      });
    }
    const queue = new AsyncQueue<ThreadEvent>();
    void this.executeTurn(prompt, runOptions, queue);
    return { events: queue };
  }

  async run(prompt: string, runOptions: RunOptions = {}): Promise<RunResult> {
    const { events } = await this.runStreamed(prompt, runOptions);
    const items = new Map<string, ThreadItem>();
    let finalResponse = "";
    let usage: RunResult["usage"] = null;
    let failure: Extract<ThreadEvent, { type: "error" }> | null = null;
    let turnFailure: string | null = null;

    for await (const event of events) {
      if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
        items.set(event.item.id, event.item);
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text;
        }
      } else if (event.type === "turn.completed") {
        usage = event.usage;
      } else if (event.type === "turn.failed") {
        turnFailure = event.error.message;
      } else if (event.type === "error") {
        failure = event;
      }
    }

    if (failure) {
      throw new Error(failure.message);
    }

    if (turnFailure) {
      throw new Error(turnFailure);
    }

    return {
      items: Array.from(items.values()),
      finalResponse,
      usage
    };
  }

  private async executeTurn(prompt: string, runOptions: RunOptions, queue: AsyncQueue<ThreadEvent>): Promise<void> {
    if (!this.runtime) {
      throw new Error("WASM runtime was not initialized");
    }

    const tools = runOptions.tools ?? this.threadOptions.tools ?? [];
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    let step = 0;

    try {
      const started = this.runtime.startTurn({
        threadId: this.threadId,
        prompt,
        tools: toolMetadata(tools)
      });
      this.threadId = started.threadId;

      if (started.isNewThread) {
        queue.push({
          type: "thread.started",
          threadId: started.threadId
        });
      }

      queue.push({ type: "turn.started" });

      let request = started.request;
      while (true) {
        for await (const rawEvent of this.transport.streamResponse({
          threadId: started.threadId,
          body: request,
          signal: runOptions.signal
        })) {
          const emittedEvents = this.runtime.ingestStreamEvent(started.threadId, rawEvent);
          for (const event of emittedEvents) {
            queue.push(event);
          }
        }

        const resolution = this.runtime.completeResponse(started.threadId);
        if (resolution.kind === "completed") {
          queue.push({
            type: "turn.completed",
            usage: resolution.usage
          });
          return;
        }

        if (resolution.kind === "failed") {
          queue.push({
            type: "turn.failed",
            error: {
              message: resolution.message
            }
          });
          return;
        }

        const toolOutputs: Array<{
          callId: string;
          name: string;
          output: unknown;
          isError: boolean;
        }> = [];
        for (const toolCall of resolution.toolCalls) {
          const tool = toolMap.get(toolCall.name);
          if (!tool) {
            const errorMessage = `Tool "${toolCall.name}" is not registered`;
            const failedItem: ItemCompletedEvent = {
              type: "item.completed",
              item: {
                id: toolCall.id,
                type: "tool_call",
                callId: toolCall.callId,
                name: toolCall.name,
                arguments: toolCall.arguments,
                status: "failed",
                error: errorMessage
              }
            };
            queue.push(failedItem);
            toolOutputs.push({
              callId: toolCall.callId,
              name: toolCall.name,
              output: errorMessage,
              isError: true
            });
            continue;
          }

          try {
            if (runOptions.signal?.aborted) {
              throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
            }
            const result = await tool.execute(parseToolArguments(toolCall.arguments), {
              threadId: started.threadId,
              callId: toolCall.callId,
              step,
              signal: runOptions.signal ?? new AbortController().signal
            });
            if (runOptions.signal?.aborted) {
              throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
            }
            queue.push({
              type: "item.completed",
              item: {
                id: toolCall.id,
                type: "tool_call",
                callId: toolCall.callId,
                name: toolCall.name,
                arguments: toolCall.arguments,
                status: "completed",
                result
              }
            });
            toolOutputs.push({
              callId: toolCall.callId,
              name: toolCall.name,
              output: result ?? null,
              isError: false
            });
          } catch (error) {
            const errorMessage = toErrorMessage(error);
            queue.push({
              type: "item.completed",
              item: {
                id: toolCall.id,
                type: "tool_call",
                callId: toolCall.callId,
                name: toolCall.name,
                arguments: toolCall.arguments,
                status: "failed",
                error: errorMessage
              }
            });
            toolOutputs.push({
              callId: toolCall.callId,
              name: toolCall.name,
              output: errorMessage,
              isError: true
            });
          }
        }

        step += 1;
        request = this.runtime.submitToolOutputs(started.threadId, toolOutputs);
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      queue.push({
        type: "error",
        message: toErrorMessage(error)
      });
    } finally {
      queue.close();
    }
  }
}
