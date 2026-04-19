import initWasm, { WasmCodexRuntime } from "./generated/wasm/codex_web_sdk_wasm.js";
import type { RawResponsesStreamEvent, ThreadEvent, ThreadItem, Usage } from "./types";

type StartTurnResult = {
  threadId: string;
  isNewThread: boolean;
  request: Record<string, unknown>;
};

type ToolExecutionRequest = {
  id: string;
  callId: string;
  name: string;
  arguments: string;
};

function toPlainData<T>(value: T): T {
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, childValue]) => [String(key), toPlainData(childValue)])
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPlainData(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, childValue]) => [key, toPlainData(childValue)])
    ) as T;
  }

  return value;
}

export type TurnResolution =
  | {
      kind: "completed";
      usage: Usage;
    }
  | {
      kind: "needs_tool_outputs";
      toolCalls: ToolExecutionRequest[];
    }
  | {
      kind: "failed";
      message: string;
    };

let initPromise: Promise<void> | null = null;

async function resolveInitInput(input?: unknown): Promise<Parameters<typeof initWasm>[0]> {
  if (input !== undefined) {
    return input as Parameters<typeof initWasm>[0];
  }

  const wasmUrl = new URL("./generated/wasm/codex_web_sdk_wasm_bg.wasm", import.meta.url);
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to load WASM module from ${wasmUrl.toString()}`);
  }

  return await response.arrayBuffer();
}

function normalizeUsage(raw: {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}): Usage {
  return {
    inputTokens: raw.input_tokens,
    cachedInputTokens: raw.cached_input_tokens,
    outputTokens: raw.output_tokens,
  };
}

function normalizeItem(raw: Record<string, unknown>): ThreadItem {
  if (raw.type === "tool_call") {
    return {
      id: String(raw.id),
      type: "tool_call",
      callId: String(raw.call_id),
      name: String(raw.name),
      arguments: String(raw.arguments),
      status: raw.status as ThreadItem["status"],
      result: raw.result,
      error: raw.error === undefined ? undefined : String(raw.error),
    };
  }

  if (raw.type === "reasoning") {
    return {
      id: String(raw.id),
      type: "reasoning",
      text: String(raw.text ?? ""),
      status: raw.status as ThreadItem["status"],
    };
  }

  return {
    id: String(raw.id),
    type: "agent_message",
    text: String(raw.text ?? ""),
    status: raw.status as ThreadItem["status"],
  };
}

function normalizeEvent(raw: Record<string, unknown>): ThreadEvent {
  switch (raw.type) {
    case "text.delta":
      return {
        type: "text.delta",
        itemId: String(raw.item_id),
        delta: String(raw.delta ?? ""),
        snapshot: String(raw.snapshot ?? ""),
      };
    case "item.started":
      return {
        type: "item.started",
        item: normalizeItem(raw.item as Record<string, unknown>),
      };
    case "item.updated":
      return {
        type: "item.updated",
        item: normalizeItem(raw.item as Record<string, unknown>),
      };
    case "item.completed":
      return {
        type: "item.completed",
        item: normalizeItem(raw.item as Record<string, unknown>),
      };
    default:
      throw new Error(`Unsupported runtime event: ${String(raw.type)}`);
  }
}

export async function ensureWasmInitialized(input?: unknown): Promise<void> {
  if (!initPromise) {
    initPromise = resolveInitInput(input)
      .then((resolvedInput) => initWasm({ module_or_path: resolvedInput as Parameters<typeof initWasm>[0] }))
      .then(() => undefined);
  }

  return initPromise;
}

export class RuntimeBridge {
  private readonly inner: WasmCodexRuntime;

  constructor(config: {
    model?: string;
    instructions?: string;
    maxToolRoundtrips?: number;
  }) {
    const runtimeConfig: Record<string, unknown> = {};
    if (config.model !== undefined) {
      runtimeConfig.model = config.model;
    }
    if (config.instructions !== undefined) {
      runtimeConfig.instructions = config.instructions;
    }
    if (config.maxToolRoundtrips !== undefined) {
      runtimeConfig.max_tool_roundtrips = config.maxToolRoundtrips;
    }

    this.inner = new WasmCodexRuntime(runtimeConfig);
  }

  startTurn(args: {
    threadId: string | null;
    prompt: string;
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: unknown;
    }>;
  }): StartTurnResult {
    const payload: Record<string, unknown> = {
      prompt: args.prompt,
      tools: args.tools.map((tool) => {
        const serializedTool: Record<string, unknown> = {
          name: tool.name,
        };
        if (tool.description !== undefined) {
          serializedTool.description = tool.description;
        }
        if (tool.inputSchema !== undefined) {
          serializedTool.input_schema = tool.inputSchema;
        }
        return serializedTool;
      }),
    };
    if (args.threadId !== null) {
      payload.thread_id = args.threadId;
    }

    const raw = toPlainData(
      this.inner.start_turn({
      ...payload,
      })
    ) as {
      thread_id: string;
      is_new_thread: boolean;
      request: Record<string, unknown>;
    };

    return {
      threadId: raw.thread_id,
      isNewThread: raw.is_new_thread,
      request: raw.request,
    };
  }

  ingestStreamEvent(threadId: string, event: RawResponsesStreamEvent): ThreadEvent[] {
    const raw = toPlainData(
      this.inner.ingest_stream_event(threadId, event)
    ) as Array<Record<string, unknown>>;
    return raw.map(normalizeEvent);
  }

  completeResponse(threadId: string): TurnResolution {
    const raw = toPlainData(
      this.inner.complete_response(threadId)
    ) as
      | {
          kind: "completed";
          usage: {
            input_tokens: number;
            cached_input_tokens: number;
            output_tokens: number;
          };
        }
      | {
          kind: "needs_tool_outputs";
          tool_calls: Array<{
            id: string;
            call_id: string;
            name: string;
            arguments: string;
          }>;
        }
      | {
          kind: "failed";
          message: string;
        };

    if (raw.kind === "completed") {
      return {
        kind: "completed",
        usage: normalizeUsage(raw.usage),
      };
    }

    if (raw.kind === "needs_tool_outputs") {
      return {
        kind: "needs_tool_outputs",
        toolCalls: raw.tool_calls.map((toolCall) => ({
          id: toolCall.id,
          callId: toolCall.call_id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        })),
      };
    }

    return raw;
  }

  submitToolOutputs(
    threadId: string,
    outputs: Array<{
      callId: string;
      name: string;
      output: unknown;
      isError: boolean;
    }>
  ): Record<string, unknown> {
    return toPlainData(
      this.inner.submit_tool_outputs(
        threadId,
        outputs.map((output) => ({
          call_id: output.callId,
          name: output.name,
          output: output.output,
          is_error: output.isError,
        }))
      )
    ) as Record<string, unknown>;
  }
}
