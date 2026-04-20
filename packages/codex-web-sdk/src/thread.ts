import { AsyncQueue } from "./asyncQueue";
import { createThreadConfig, mergeThreadConfig, snapshotFromConfig } from "./config";
import type { McpRegistry } from "./mcp/registry";
import { RuntimeBridge, ensureWasmInitialized } from "./runtime";
import { createBrowserRuntimeAdapter } from "./runtime/adapters";
import type {
  CodexClientConfig,
  CodexThreadConfig,
  ItemCompletedEvent,
  RunResult,
  SerializableThreadConfig,
  StreamedRunResult,
  ThreadConfigUpdate,
  ThreadEvent,
  ThreadItem,
  ThreadRunOptions,
  ThreadSnapshot,
  ToolDefinition,
  ToolSource
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

function getDefaultToolSource(name: string): ToolSource {
  return {
    kind: name.startsWith("mcp__") ? "mcp" : "local"
  };
}

function toReasoningSummary(summary: unknown): string | undefined {
  if (summary === undefined || summary === null) {
    return undefined;
  }

  if (summary === true) {
    return "auto";
  }

  if (summary === false) {
    return "none";
  }

  return typeof summary === "string" ? summary : undefined;
}

function patchRequestBody(
  request: Record<string, unknown>,
  config: CodexThreadConfig,
  lastResponseId: string | null
): Record<string, unknown> {
  const body = { ...request };

  if (config.model) {
    body.model = config.model;
  }

  if (config.systemPrompt) {
    body.instructions = config.systemPrompt;
  } else {
    delete body.instructions;
  }

  if (config.reasoning) {
    body.reasoning = {
      effort: config.reasoning.effort,
      ...(config.reasoning.summary !== undefined
        ? { summary: toReasoningSummary(config.reasoning.summary) }
        : {})
    };
  } else {
    delete body.reasoning;
  }

  if (config.metadata) {
    body.metadata = config.metadata;
  } else {
    delete body.metadata;
  }

  if (lastResponseId) {
    body.previous_response_id = lastResponseId;
  }

  return body;
}

function isTransportConfigChange(update: ThreadConfigUpdate): boolean {
  return (
    update.apiKey !== undefined ||
    update.baseUrl !== undefined ||
    update.headers !== undefined ||
    update.transport !== undefined ||
    update.fetch !== undefined ||
    update.runtimeAdapter !== undefined
  );
}

function isMcpConfigChange(update: ThreadConfigUpdate): boolean {
  return update.mcpServers !== undefined || update.mcpRegistry !== undefined || update.runtimeAdapter !== undefined;
}

export class CodexClient {
  constructor(private readonly options: CodexClientConfig = {}) {}

  startThread(threadOptions: CodexThreadConfig = {}): CodexThread {
    return new CodexThread(this.options, threadOptions);
  }
}

export class CodexThread {
  private runtime: RuntimeBridge | null = null;
  private config: CodexThreadConfig;
  private transport: CodexThreadConfig["transport"] | null = null;
  private registry: McpRegistry | null = null;
  private runtimeAdapter;

  constructor(
    private readonly options: CodexClientConfig,
    threadOptions: CodexThreadConfig = {}
  ) {
    this.config = createThreadConfig(options, threadOptions);
    this.transport = this.options.transport ?? null;
    this.registry = this.options.mcpRegistry ?? null;
    this.runtimeAdapter = this.config.runtimeAdapter ?? createBrowserRuntimeAdapter();
  }

  get id(): string | null {
    return this.config.threadId ?? null;
  }

  get lastResponseId(): string | null {
    return this.config.lastResponseId ?? null;
  }

  getConfig(): CodexThreadConfig {
    return this.config;
  }

  setConfig(update: ThreadConfigUpdate): CodexThreadConfig {
    this.config = mergeThreadConfig(this.config, update);
    if (update.runtimeAdapter) {
      this.runtimeAdapter = update.runtimeAdapter;
      this.transport = null;
      this.registry = null;
    }
    if (isTransportConfigChange(update)) {
      this.transport = update.transport ?? null;
    }
    if (isMcpConfigChange(update)) {
      this.registry = update.mcpRegistry ?? null;
    }
    return this.config;
  }

  snapshot(): ThreadSnapshot {
    return snapshotFromConfig(this.config);
  }

  restore(snapshot: ThreadSnapshot, config: ThreadConfigUpdate = {}): CodexThread {
    const base: SerializableThreadConfig = snapshot.config;
    this.setConfig({
      ...base,
      ...config,
      threadId: snapshot.threadId,
      lastResponseId: snapshot.lastResponseId
    });
    return this;
  }

  async runStreamed(prompt: string, runOptions: ThreadRunOptions = {}): Promise<StreamedRunResult> {
    await ensureWasmInitialized(this.config.wasmUrl ?? this.options.wasmUrl);
    if (!this.runtime) {
      this.runtime = new RuntimeBridge({
        model: this.config.model,
        instructions: this.config.systemPrompt,
        maxToolRoundtrips: this.config.maxToolRoundtrips
      });
    }
    const queue = new AsyncQueue<ThreadEvent>();
    void this.executeTurn(prompt, runOptions, queue);
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

  private getTransport(config: CodexThreadConfig) {
    if (config.transport) {
      return config.transport;
    }

    if (this.transport) {
      return this.transport;
    }

    this.transport = this.runtimeAdapter.createResponsesTransport(config);
    return this.transport;
  }

  private getRegistry(config: CodexThreadConfig): McpRegistry {
    if (config.mcpRegistry) {
      return config.mcpRegistry;
    }

    if (this.registry) {
      if (typeof this.registry.setServers === "function") {
        this.registry.setServers(config.mcpServers ?? []);
      }
      return this.registry;
    }

    this.registry = this.runtimeAdapter.createMcpRegistry({
      servers: config.mcpServers ?? []
    });
    return this.registry;
  }

  private async resolveTools(config: CodexThreadConfig, signal?: AbortSignal): Promise<ToolDefinition[]> {
    const baseTools = config.tools ?? [];
    if (!config.mcpServers?.length) {
      return baseTools;
    }

    const registry = this.getRegistry(config);
    const mcpTools = registry.asTools(await registry.listTools({
      servers: config.mcpServers,
      signal
    }));
    return [...baseTools, ...mcpTools];
  }

  private async executeTurn(
    prompt: string,
    runOptions: ThreadRunOptions,
    queue: AsyncQueue<ThreadEvent>
  ): Promise<void> {
    if (!this.runtime) {
      throw new Error("WASM runtime was not initialized");
    }

    const effectiveConfig = mergeThreadConfig(this.config, runOptions);
    const tools = await this.resolveTools(effectiveConfig, runOptions.signal);
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    const transport = this.getTransport(effectiveConfig);
    let step = 0;

    try {
      const started = this.runtime.startTurn({
        threadId: effectiveConfig.threadId ?? null,
        prompt,
        tools: toolMetadata(tools)
      });
      this.config.threadId = started.threadId;
      if (effectiveConfig.threadId === null || effectiveConfig.threadId === undefined) {
        queue.push({
          type: "thread.started",
          threadId: started.threadId
        });
      }

      queue.push({ type: "turn.started" });

      let request = patchRequestBody(started.request, effectiveConfig, effectiveConfig.lastResponseId ?? null);
      while (true) {
        for await (const rawEvent of transport.streamResponse({
          threadId: started.threadId,
          body: request,
          signal: runOptions.signal
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
            this.config.lastResponseId = completedResponseId;
          }

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
            if (runOptions.signal?.aborted) {
              throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
            }
            const result = await tool.execute(parseToolArguments(toolCall.arguments), {
              threadId: started.threadId,
              callId: toolCall.callId,
              step,
              signal: runOptions.signal ?? new AbortController().signal,
              source
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
        request = patchRequestBody(
          this.runtime.submitToolOutputs(started.threadId, toolOutputs),
          effectiveConfig,
          this.config.lastResponseId ?? null
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

export const CodexWeb = CodexClient;
export const Thread = CodexThread;

export function createCodexClient(config: CodexClientConfig = {}): CodexClient {
  return new CodexClient(config);
}
