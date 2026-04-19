import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { CodexWeb } from "./thread";
import type {
  AgentOptions,
  CodexChatMessage,
  CodexChatStatus,
  RunOptions,
  ThreadEvent,
  ThreadItem,
  ThreadOptions,
  ToolDefinition,
  Usage
} from "./types";

type HookCallbacks = {
  onEvent?: (event: ThreadEvent) => void;
  onError?: (error: Error) => void;
  onFinish?: (result: { usage: Usage | null; messages: CodexChatMessage[] }) => void;
};

export type UseCodexAgentOptions = HookCallbacks & {
  agent?: CodexWeb;
  agentOptions?: AgentOptions;
  threadOptions?: ThreadOptions;
  tools?: ToolDefinition[];
  initialInput?: string;
};

export type UseCodexAgentResult = {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  messages: CodexChatMessage[];
  events: ThreadEvent[];
  status: CodexChatStatus;
  error: Error | null;
  usage: Usage | null;
  threadId: string | null;
  submit: (input?: string, options?: RunOptions) => Promise<void>;
  stop: () => void;
  reset: () => void;
};

type Updater = (message: CodexChatMessage) => CodexChatMessage;

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function updateMessage(
  messages: CodexChatMessage[],
  messageId: string,
  updater: Updater
): CodexChatMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    return updater(message);
  });
}

function mergeSignal(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) {
    return primary;
  }

  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any([primary, secondary]);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (primary.aborted || secondary.aborted) {
    abort();
    return controller.signal;
  }

  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export function useCodexAgent(options: UseCodexAgentOptions = {}): UseCodexAgentResult {
  const {
    agent: providedAgent,
    agentOptions,
    threadOptions,
    tools,
    initialInput = "",
    onError,
    onEvent,
    onFinish
  } = options;

  const agent = useMemo(() => providedAgent ?? new CodexWeb(agentOptions), [providedAgent]);
  const threadRef = useRef<ReturnType<CodexWeb["startThread"]> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [input, setInput] = useState(initialInput);
  const [messages, setMessages] = useState<CodexChatMessage[]>([]);
  const [events, setEvents] = useState<ThreadEvent[]>([]);
  const [status, setStatus] = useState<CodexChatStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    stop();
    threadRef.current = null;
    setInput(initialInput);
    setMessages([]);
    setEvents([]);
    setStatus("idle");
    setError(null);
    setUsage(null);
    setThreadId(null);
  }, [initialInput, stop]);

  const submit = useCallback(
    async (nextInput?: string, runOptions: RunOptions = {}) => {
      if (status === "submitted" || status === "streaming") {
        throw new Error("A turn is already in progress");
      }

      const prompt = nextInput ?? input;
      if (!prompt.trim()) {
        return;
      }

      if (!threadRef.current) {
        threadRef.current = agent.startThread(threadOptions ?? {});
      }

      const userMessageId = createId("user");
      const assistantMessageId = createId("assistant");
      const turnItems = new Map<string, ThreadItem>();
      const controller = new AbortController();
      controllerRef.current = controller;
      const signal = mergeSignal(controller.signal, runOptions.signal);

      setError(null);
      setUsage(null);
      setEvents([]);
      setStatus("submitted");
      setMessages((current) => [
        ...current,
        {
          id: userMessageId,
          role: "user",
          content: prompt,
          createdAt: Date.now(),
          status: "ready",
          items: [],
          usage: null
        },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
          status: "submitted",
          items: [],
          usage: null
        }
      ]);
      setInput("");

      try {
        const { events: streamedEvents } = await threadRef.current.runStreamed(prompt, {
          ...runOptions,
          tools: runOptions.tools ?? tools,
          signal
        });
        setThreadId(threadRef.current.id);

        for await (const event of streamedEvents) {
          setEvents((current) => [...current, event]);
          onEvent?.(event);

          switch (event.type) {
            case "thread.started":
              setThreadId(event.threadId);
              break;
            case "turn.started":
              setStatus("streaming");
              break;
            case "text.delta":
              setStatus("streaming");
              setMessages((current) =>
                updateMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  content: event.snapshot,
                  status: "streaming"
                }))
              );
              break;
            case "item.started":
            case "item.updated":
            case "item.completed":
              turnItems.set(event.item.id, event.item);
              setMessages((current) =>
                updateMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  items: Array.from(turnItems.values()),
                  content:
                    event.item.type === "agent_message" && event.item.text
                      ? event.item.text
                      : message.content,
                  status:
                    event.type === "item.completed" && event.item.type === "agent_message"
                      ? "ready"
                      : message.status
                }))
              );
              break;
            case "turn.completed": {
              setUsage(event.usage);
              setStatus("ready");
              const finalMessages = (() => {
                let snapshot: CodexChatMessage[] = [];
                setMessages((current) => {
                  snapshot = updateMessage(current, assistantMessageId, (message) => ({
                    ...message,
                    items: Array.from(turnItems.values()),
                    status: "ready",
                    usage: event.usage
                  }));
                  return snapshot;
                });
                return snapshot;
              })();
              onFinish?.({
                usage: event.usage,
                messages: finalMessages
              });
              break;
            }
            case "turn.failed": {
              const failure = new Error(event.error.message);
              setError(failure);
              setStatus("error");
              setMessages((current) =>
                updateMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  items: Array.from(turnItems.values()),
                  status: "error",
                  error: event.error.message
                }))
              );
              onError?.(failure);
              break;
            }
            case "error": {
              const failure = new Error(event.message);
              setError(failure);
              setStatus("error");
              setMessages((current) =>
                updateMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  items: Array.from(turnItems.values()),
                  status: "error",
                  error: event.message
                }))
              );
              onError?.(failure);
              break;
            }
          }
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        if (signal.aborted) {
          setStatus("idle");
          setMessages((current) =>
            updateMessage(current, assistantMessageId, (message) => ({
              ...message,
              items: Array.from(turnItems.values()),
              status: message.content ? "ready" : "submitted"
            }))
          );
        }
      }
    },
    [agent, input, onError, onEvent, onFinish, status, threadOptions, tools]
  );

  return {
    input,
    setInput,
    messages,
    events,
    status,
    error,
    usage,
    threadId,
    submit,
    stop,
    reset
  };
}
