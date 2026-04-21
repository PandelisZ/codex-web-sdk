import type { McpRegistry } from "./mcp/registry";
import type { CodexRuntimeAdapter } from "./runtime/adapters";

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
export type CodexRuntimeKind = "browser" | "node";
export type ToolSourceKind = "local" | "mcp";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ReasoningSummary = "auto" | "concise" | "detailed" | "none";

export type ReasoningConfig = {
  effort: ReasoningEffort;
  summary?: ReasoningSummary;
};

export type ToolSource = {
  kind: ToolSourceKind;
  serverId?: string;
  serverName?: string;
  toolName?: string;
};

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
  source?: ToolSource;
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

export type RawEventObservedEvent = {
  type: "raw.event";
  event: RawResponsesStreamEvent;
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
  | ErrorEvent
  | RawEventObservedEvent;

export type ToolExecutionContext = {
  threadId: string;
  callId: string;
  step: number;
  signal: AbortSignal;
  source: ToolSource;
};

export type ToolDefinition<TInput = unknown, TResult = unknown> = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  metadata?: Record<string, JsonValue>;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<TResult> | TResult;
};

export type SerializableHeaders = Record<string, string>;

export type BaseMcpServerDescriptor = {
  id: string;
  name?: string;
  enabled?: boolean;
  headers?: SerializableHeaders;
  metadata?: Record<string, JsonValue>;
  timeoutMs?: number;
};

export type StreamableHttpMcpServerDescriptor = BaseMcpServerDescriptor & {
  transport: "streamable-http";
  url: string;
};

export type SseMcpServerDescriptor = BaseMcpServerDescriptor & {
  transport: "sse";
  url: string;
};

export type WebSocketMcpServerDescriptor = BaseMcpServerDescriptor & {
  transport: "websocket";
  url: string;
  protocols?: string[];
};

export type StdioMcpServerDescriptor = BaseMcpServerDescriptor & {
  transport: "stdio";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type McpServerDescriptor =
  | StreamableHttpMcpServerDescriptor
  | SseMcpServerDescriptor
  | WebSocketMcpServerDescriptor
  | StdioMcpServerDescriptor;

export type McpToolDescriptor = {
  id: string;
  serverId: string;
  serverName: string;
  name: string;
  qualifiedName: string;
  description?: string;
  inputSchema?: JsonSchema;
  source: ToolSource;
};

export type McpServerStatus = {
  serverId: string;
  serverName: string;
  transport: McpServerDescriptor["transport"];
  available: boolean;
  nodeOnly: boolean;
  reason?: string;
  toolCount?: number;
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

export type CodexOptions = {
  apiKey?: string;
  baseURL?: string;
  defaultHeaders?: HeadersInit;
  defaultModel?: string;
  defaultReasoning?: ReasoningConfig;
  defaultInstructions?: string;
  defaultMetadata?: Record<string, JsonValue>;
  defaultMcpServers?: McpServerDescriptor[];
  transport?: ResponsesTransport;
  fetch?: typeof fetch;
  wasmURL?: unknown;
  maxToolRoundtrips?: number;
  runtimeAdapter?: CodexRuntimeAdapter;
  mcpRegistry?: McpRegistry;
  dangerouslyAllowBrowser?: boolean;
};

export type NormalizedCodexOptions = {
  apiKey?: string;
  baseURL?: string;
  defaultHeaders?: HeadersInit;
  defaultModel?: string;
  defaultReasoning?: ReasoningConfig;
  defaultInstructions?: string;
  defaultMetadata?: Record<string, JsonValue>;
  defaultMcpServers?: McpServerDescriptor[];
  transport?: ResponsesTransport;
  fetch?: typeof fetch;
  wasmURL?: unknown;
  maxToolRoundtrips?: number;
  runtimeAdapter?: CodexRuntimeAdapter;
  mcpRegistry?: McpRegistry;
};

export type ThreadOptions = {
  model?: string;
  reasoning?: ReasoningConfig;
  instructions?: string;
  tools?: ToolDefinition[];
  mcpServers?: McpServerDescriptor[];
  metadata?: Record<string, JsonValue>;
  maxToolRoundtrips?: number;
  threadId?: string | null;
  lastResponseId?: string | null;
};

export type ResolvedThreadOptions = ThreadOptions;
export type ThreadUpdate = Partial<ThreadOptions>;

export type ThreadRunOptions = Partial<
  Omit<ThreadOptions, "threadId" | "lastResponseId">
> & {
  signal?: AbortSignal;
};

export type SerializableThreadOptions = {
  model?: string;
  reasoning?: ReasoningConfig;
  instructions?: string;
  mcpServers?: McpServerDescriptor[];
  metadata?: Record<string, JsonValue>;
  maxToolRoundtrips?: number;
};

export type ThreadSnapshot = {
  threadId: string | null;
  lastResponseId: string | null;
  options: SerializableThreadOptions;
};

export type RunResult = {
  items: ThreadItem[];
  finalResponse: string;
  usage: Usage | null;
  events: ThreadEvent[];
};

export type StreamedRunResult = {
  events: AsyncIterableIterator<ThreadEvent>;
};

export type CreateMcpRegistryOptions = {
  servers?: McpServerDescriptor[];
  adapters?: McpTransportAdapter[];
  runtime?: CodexRuntimeKind;
  fetch?: typeof fetch;
};

export interface McpTransportAdapter {
  readonly transport: McpServerDescriptor["transport"];
  readonly runtime: CodexRuntimeKind;
  listTools(server: McpServerDescriptor, signal?: AbortSignal): Promise<McpToolDescriptor[]>;
  callTool(args: {
    server: McpServerDescriptor;
    tool: McpToolDescriptor;
    input: unknown;
    signal?: AbortSignal;
  }): Promise<unknown>;
  dispose?(): Promise<void>;
}

export type LegacyCodexOptions = {
  apiKey?: string;
  baseUrl?: string;
  headers?: HeadersInit;
  model?: string;
  reasoning?: ReasoningConfig;
  systemPrompt?: string;
  metadata?: Record<string, JsonValue>;
  mcpServers?: McpServerDescriptor[];
  transport?: ResponsesTransport;
  fetch?: typeof fetch;
  wasmUrl?: unknown;
  maxToolRoundtrips?: number;
  runtimeAdapter?: CodexRuntimeAdapter;
  mcpRegistry?: McpRegistry;
  dangerouslyAllowBrowser?: boolean;
};

export type LegacyThreadOptions = {
  model?: string;
  reasoning?: ReasoningConfig;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  mcpServers?: McpServerDescriptor[];
  metadata?: Record<string, JsonValue>;
  maxToolRoundtrips?: number;
  threadId?: string | null;
  lastResponseId?: string | null;
};

export type CodexClientConfig = CodexOptions;
export type CodexThreadConfig = ThreadOptions;
export type ThreadConfigUpdate = ThreadUpdate;
export type AgentOptions = CodexOptions;
export type SerializableThreadConfig = SerializableThreadOptions;
export type ThreadOptionsLegacy = ThreadOptions;
export type RunOptions = ThreadRunOptions;
