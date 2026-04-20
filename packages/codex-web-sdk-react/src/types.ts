import type { Dispatch, ReactNode, SetStateAction } from "react";

import type {
  CodexClient,
  CodexThread,
  CodexClientConfig,
  CodexThreadConfig,
  RawResponsesStreamEvent,
  ReasoningConfig,
  ThreadConfigUpdate,
  ThreadEvent,
  ThreadRunOptions,
  ThreadSnapshot,
  ToolDefinition,
  Usage,
  McpServerDescriptor
} from "@pandelis/codex-web-sdk";

export type CodexChatStatus = "idle" | "submitted" | "streaming" | "ready" | "error";
export type CodexMessageRole = "user" | "assistant" | "reasoning" | "tool_call" | "tool_result" | "error";

export type CodexChatMessage = {
  id: string;
  role: CodexMessageRole;
  content: string;
  createdAt: number;
  status: CodexChatStatus | "in_progress" | "completed" | "failed";
  metadata?: Record<string, unknown>;
  usage?: Usage | null;
};

export type CodexChatSessionSnapshot = {
  id: string;
  thread: ThreadSnapshot;
  input: string;
  messages: CodexChatMessage[];
  events: ThreadEvent[];
  rawEvents: RawResponsesStreamEvent[];
  usage: Usage | null;
  error: string | null;
  updatedAt: number;
};

export type CodexPersistenceAdapter = {
  loadSession?: (id: string) => Promise<CodexChatSessionSnapshot | null> | CodexChatSessionSnapshot | null;
  saveSession?: (session: CodexChatSessionSnapshot) => Promise<void> | void;
  clearSession?: (id: string) => Promise<void> | void;
};

export type CodexProviderValue = {
  client: CodexClient;
  defaultConfig: CodexClientConfig;
  persistence?: CodexPersistenceAdapter;
};

export type CodexProviderProps = {
  children: ReactNode;
  client?: CodexClient;
  config?: CodexClientConfig;
  persistence?: CodexPersistenceAdapter;
};

export type UseCodexThreadOptions = {
  client?: CodexClient;
  config?: CodexThreadConfig;
  snapshot?: ThreadSnapshot;
  thread?: CodexThread;
};

export type UseCodexThreadResult = {
  client: CodexClient;
  thread: CodexThread;
  config: CodexThreadConfig;
  setConfig: (update: ThreadConfigUpdate) => void;
  restoreThread: (snapshot: ThreadSnapshot, update?: ThreadConfigUpdate) => void;
  snapshot: ThreadSnapshot;
};

export type UseCodexChatCallbacks = {
  onEvent?: (event: ThreadEvent) => void;
  onError?: (error: Error) => void;
  onFinish?: (result: { usage: Usage | null; messages: CodexChatMessage[] }) => void;
};

export type UseCodexChatOptions = UseCodexThreadOptions &
  UseCodexChatCallbacks & {
    initialInput?: string;
    initialMessages?: CodexChatMessage[];
    initialEvents?: ThreadEvent[];
    initialRawEvents?: RawResponsesStreamEvent[];
    sessionId?: string;
  };

export type UseCodexChatResult = {
  thread: CodexThread;
  messages: CodexChatMessage[];
  events: ThreadEvent[];
  rawEvents: RawResponsesStreamEvent[];
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: CodexChatStatus;
  error: Error | null;
  usage: Usage | null;
  threadId: string | null;
  config: CodexThreadConfig;
  sendMessage: (input?: string, options?: ThreadRunOptions) => Promise<void>;
  stop: () => void;
  reload: () => Promise<void>;
  reset: () => void;
  setModel: (model?: string) => void;
  setReasoning: (reasoning?: ReasoningConfig) => void;
  setTools: (tools: ToolDefinition[]) => void;
  setMcpServers: (servers: McpServerDescriptor[]) => void;
  setConfig: (update: ThreadConfigUpdate) => void;
  restoreSession: (session: CodexChatSessionSnapshot) => void;
  snapshotSession: () => CodexChatSessionSnapshot;
};

export type UseCodexAgentOptions = UseCodexChatOptions;

export type UseCodexAgentResult = UseCodexChatResult & {
  submit: UseCodexChatResult["sendMessage"];
};
