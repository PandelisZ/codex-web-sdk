import type { Dispatch, ReactNode, SetStateAction } from "react";

import type {
  Codex,
  CodexOptions,
  CodexThread,
  McpServerDescriptor,
  RawResponsesStreamEvent,
  ReasoningConfig,
  ThreadEvent,
  ThreadOptions,
  ThreadRunOptions,
  ThreadSnapshot,
  ThreadUpdate,
  ToolDefinition,
  Usage
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
  client: Codex;
  defaultOptions: CodexOptions;
  persistence?: CodexPersistenceAdapter;
};

export type CodexProviderProps = {
  children: ReactNode;
  client?: Codex;
  options?: CodexOptions;
  persistence?: CodexPersistenceAdapter;
};

export type UseCodexThreadOptions = {
  client?: Codex;
  threadOptions?: ThreadOptions;
  snapshot?: ThreadSnapshot;
  thread?: CodexThread;
};

export type UseCodexThreadResult = {
  client: Codex;
  thread: CodexThread;
  threadOptions: ThreadOptions;
  setThreadOptions: (update: ThreadUpdate) => void;
  restoreThread: (snapshot: ThreadSnapshot, update?: ThreadUpdate) => void;
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
  threadOptions: ThreadOptions;
  sendMessage: (input?: string, options?: ThreadRunOptions) => Promise<void>;
  stop: () => void;
  reload: () => Promise<void>;
  reset: () => void;
  setModel: (model?: string) => void;
  setReasoning: (reasoning?: ReasoningConfig) => void;
  setTools: (tools: ToolDefinition[]) => void;
  setMcpServers: (servers: McpServerDescriptor[]) => void;
  setThreadOptions: (update: ThreadUpdate) => void;
  restoreSession: (session: CodexChatSessionSnapshot) => void;
  snapshotSession: () => CodexChatSessionSnapshot;
};

export type UseCodexAgentOptions = UseCodexChatOptions;

export type UseCodexAgentResult = UseCodexChatResult & {
  submit: UseCodexChatResult["sendMessage"];
};
