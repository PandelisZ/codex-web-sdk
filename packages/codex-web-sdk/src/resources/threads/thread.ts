import { AsyncQueue } from "../../asyncQueue";
import { createThreadOptions, mergeThreadOptions, snapshotFromThreadOptions } from "../../core/config";
import { buildRequestBody } from "../../core/request-options";
import type { McpRegistry } from "../../mcp/registry";
import { RuntimeBridge, ensureWasmInitialized } from "../../runtime";
import type {
  ItemCompletedEvent,
  RunResult,
  StreamedRunResult,
  ThreadEvent,
  ThreadItem,
  ThreadOptions,
  ThreadRunOptions,
  ThreadSnapshot,
  ToolDefinition,
  ToolSource
} from "../../types";
import type { ThreadClient } from "./client";

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

function getDefaultToolSource(name: string): ToolSource {
  return {
    kind: name.startsWith("mcp__") ? "mcp" : "local"
  };
}

export class CodexThread {
  private options: ThreadOptions;

  constructor(
    private readonly client: ThreadClient,
    threadOptions: ThreadOptions = {}
  ) {
    this.options = createThreadOptions(client.getOptions(), threadOptions);
  }

  get id(): string | null {
    return this.options.threadId ?? null;
  }

  get lastResponseId(): string | null {
    return this.options.lastResponseId ?? null;
  }

  getOptions(): ThreadOptions {
    return this.options;
  }

  update(update: Partial<ThreadOptions>): ThreadOptions {
    this.options = mergeThreadOptions(this.options, update);
    return this.options;
  }

  snapshot(): ThreadSnapshot {
    return snapshotFromThreadOptions(this.options);
  }

  restore(snapshot: ThreadSnapshot, update: Partial<ThreadOptions> = {}): CodexThread {
    this.update({
      ...snapshot.options,
      ...update,
      threadId: snapshot.threadId,
      lastResponseId: snapshot.lastResponseId
    });
    return this;
  }

  async runStreamed(prompt: string, runOptions: ThreadRunOptions = {}): Promise<StreamedRunResult> {
    const clientOptions = this.client.getOptions();
    const effectiveOptions = mergeThreadOptions(this.options, runOptions);
    await ensureWasmInitialized(clientOptions.wasmURL);
    const runtime = new RuntimeBridge({
      model: effectiveOptions.model,
      instructions: effectiveOptions.instructions,
      maxToolRoundtrips: effectiveOptions.maxToolRoundtrips
    });
    const queue = new AsyncQueue<ThreadEvent>();
    void this.executeTurn(runtime, prompt, effectiveOptions, runOptions.signal, queue);
    return { events: queue };
  }

  async run(prompt: string, runOptions: ThreadRunOptions = {}): Promise<RunResult> {
    const { events } = await this.runStreamed(prompt, runOptions);
    const items = new Map<string, ThreadItem>();
    const eventLog: ThreadEvent[] = [];
    let finalResponse = "";
    let usage: RunResult["usage"] = null;
    let failure: Extract<ThreadEvent, { type: "error" }> | null = null;
    let turnFailure: string | null = null;

    for await (const event of events) {
      eventLog.push(event);
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
      usage,
      events: eventLog
    };
  }

  private async resolveTools(options: ThreadOptions, signal?: AbortSignal): Promise<ToolDefinition[]> {
    const baseTools = options.tools ?? [];
    if (!options.mcpServers?.length) {
      return baseTools;
    }

    const registry = this.client.getRegistry(options.mcpServers);
    const mcpTools = registry.asTools(await registry.listTools({
      servers: options.mcpServers,
      signal
    }));
    return [...baseTools, ...mcpTools];
  }

  private async executeTurn(
    runtime: RuntimeBridge,
    prompt: string,
    options: ThreadOptions,
    signal: AbortSignal | undefined,
    queue: AsyncQueue<ThreadEvent>
  ): Promise<void> {
    const tools = await this.resolveTools(options, signal);
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    const transport = this.client.getTransport();
    let step = 0;

    try {
      const started = runtime.startTurn({
        threadId: options.threadId ?? null,
        prompt,
        tools: toolMetadata(tools)
      });
      this.options.threadId = started.threadId;
      if (options.threadId === null || options.threadId === undefined) {
        queue.push({
          type: "thread.started",
          threadId: started.threadId
        });
      }

      queue.push({ type: "turn.started" });

      let request = buildRequestBody(started.request, options, options.lastResponseId ?? null);
      while (true) {
        for await (const rawEvent of transport.streamResponse({
          threadId: started.threadId,
          body: request,
          signal
        })) {
          queue.push({
            type: "raw.event",
            event: rawEvent
          });
          const completedResponseId =
            rawEvent.type === "response.completed" &&
            typeof rawEvent.response === "object" &&
            rawEvent.response &&
            "id" in rawEvent.response
              ? String((rawEvent.response as { id: string }).id)
              : null;
          if (completedResponseId) {
            this.options.lastResponseId = completedResponseId;
          }

          const emittedEvents = runtime.ingestStreamEvent(started.threadId, rawEvent);
          for (const event of emittedEvents) {
            queue.push(event);
          }
        }

        const resolution = runtime.completeResponse(started.threadId);
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
                error: errorMessage,
                source: getDefaultToolSource(toolCall.name)
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

          const source =
            tool.name.startsWith("mcp__") && tool.name.includes("__")
              ? {
                  kind: "mcp" as const,
                  serverId: tool.name.split("__")[1] ?? undefined
                }
              : getDefaultToolSource(tool.name);

          try {
            if (signal?.aborted) {
              throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
            }
            const result = await tool.execute(parseToolArguments(toolCall.arguments), {
              threadId: started.threadId,
              callId: toolCall.callId,
              step,
              signal: signal ?? new AbortController().signal,
              source
            });
            if (signal?.aborted) {
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
                result,
                source
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
                error: errorMessage,
                source
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
        request = buildRequestBody(
          runtime.submitToolOutputs(started.threadId, toolOutputs),
          options,
          this.options.lastResponseId ?? null
        );
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
