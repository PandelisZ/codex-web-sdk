export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type JsonSchema = JsonValue;

export type Usage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type ItemStatus = "in_progress" | "completed" | "failed";

export type AgentMessageItem = {
  id: string;
  type: "agent_message";
  text: string;
  status: ItemStatus;
};

export type ToolCallItem = {
  id: string;
  type: "tool_call";
  callId: string;
  name: string;
  arguments: string;
  status: ItemStatus;
  result?: unknown;
  error?: string;
};

export type ReasoningItem = {
  id: string;
  type: "reasoning";
  text: string;
  status: ItemStatus;
};

export type ThreadItem = AgentMessageItem | ToolCallItem | ReasoningItem;

export type ThreadStartedEvent = {
  type: "thread.started";
  threadId: string;
};

export type TurnStartedEvent = {
  type: "turn.started";
};

export type TextDeltaEvent = {
  type: "text.delta";
  itemId: string;
  delta: string;
  snapshot: string;
};

export type ItemStartedEvent = {
  type: "item.started";
  item: ThreadItem;
};

export type ItemUpdatedEvent = {
  type: "item.updated";
  item: ThreadItem;
};

export type ItemCompletedEvent = {
  type: "item.completed";
  item: ThreadItem;
};

export type TurnCompletedEvent = {
  type: "turn.completed";
  usage: Usage;
};

export type TurnFailedEvent = {
  type: "turn.failed";
  error: {
    message: string;
  };
};

export type ErrorEvent = {
  type: "error";
  message: string;
};

export type ThreadEvent =
  | ThreadStartedEvent
  | TurnStartedEvent
  | TextDeltaEvent
  | ItemStartedEvent
  | ItemUpdatedEvent
  | ItemCompletedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | ErrorEvent;

export type ToolExecutionContext = {
  threadId: string;
  callId: string;
  step: number;
  signal: AbortSignal;
};

export type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown> | unknown;
};

export type AgentOptions = {
  apiKey?: string;
  baseUrl?: string;
  headers?: HeadersInit;
  model?: string;
  instructions?: string;
  maxToolRoundtrips?: number;
  transport?: ResponsesTransport;
  fetch?: typeof fetch;
  wasmUrl?: unknown;
};

export type ThreadOptions = {
  tools?: ToolDefinition[];
};

export type RunOptions = {
  tools?: ToolDefinition[];
  signal?: AbortSignal;
};

export type RunResult = {
  items: ThreadItem[];
  finalResponse: string;
  usage: Usage | null;
};

export type StreamedRunResult = {
  events: AsyncIterableIterator<ThreadEvent>;
};

export type ResponsesRequest = {
  threadId: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
};

export type RawResponsesStreamEvent = {
  type: string;
  [key: string]: unknown;
};

export interface ResponsesTransport {
  streamResponse(request: ResponsesRequest): AsyncIterable<RawResponsesStreamEvent>;
}

export type CodexChatStatus = "idle" | "submitted" | "streaming" | "ready" | "error";

export type CodexChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: Exclude<CodexChatStatus, "idle">;
  items: ThreadItem[];
  error?: string;
  usage?: Usage | null;
};
