import { startTransition, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import type {
  McpServerDescriptor,
  ThreadEvent,
  ThreadItem,
  ThreadRunOptions,
  ToolDefinition
} from "@pandelis/codex-web-sdk";

import { useCodexProviderValue } from "./context";
import { useCodexThread } from "./useCodexThread";
import type {
  CodexChatMessage,
  CodexChatSessionSnapshot,
  CodexChatStatus,
  UseCodexChatOptions,
  UseCodexChatResult
} from "./types";

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function updateMessage(
  messages: CodexChatMessage[],
  messageId: string,
  updater: (message: CodexChatMessage) => CodexChatMessage
): CodexChatMessage[] {
  let found = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    found = true;
    return updater(message);
  });

  return found ? next : messages;
}

function upsertMessage(messages: CodexChatMessage[], message: CodexChatMessage): CodexChatMessage[] {
  const index = messages.findIndex((entry) => entry.id === message.id);
  if (index < 0) {
    return [...messages, message];
  }

  return messages.map((entry, currentIndex) => (currentIndex === index ? { ...entry, ...message } : entry));
}

function upsertMessageBefore(
  messages: CodexChatMessage[],
  message: CodexChatMessage,
  anchorId: string
): CodexChatMessage[] {
  const existingIndex = messages.findIndex((entry) => entry.id === message.id);
  const withoutExisting =
    existingIndex >= 0 ? messages.filter((entry) => entry.id !== message.id) : messages;
  const anchorIndex = withoutExisting.findIndex((entry) => entry.id === anchorId);
  if (anchorIndex < 0) {
    return [...withoutExisting, message];
  }

  return [
    ...withoutExisting.slice(0, anchorIndex),
    message,
    ...withoutExisting.slice(anchorIndex)
  ];
}

function stringifyToolPayload(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function normalizeItemMessage(item: ThreadItem): CodexChatMessage | null {
  if (item.type === "reasoning") {
    if (!item.text.trim()) {
      return null;
    }

    return {
      id: item.id,
      role: "reasoning",
      content: item.text,
      createdAt: Date.now(),
      status: item.status,
      metadata: {
        item
      }
    };
  }

  if (item.type === "tool_call") {
    return {
      id: item.id,
      role: "tool_call",
      content: item.arguments,
      createdAt: Date.now(),
      status: item.status,
      metadata: {
        name: item.name,
        callId: item.callId,
        source: item.source
      }
    };
  }

  return null;
}

function createToolResultMessage(item: Extract<ThreadItem, { type: "tool_call" }>): CodexChatMessage {
  return {
    id: `${item.id}:result`,
    role: item.status === "failed" ? "error" : "tool_result",
    content: item.status === "failed" ? item.error ?? "" : stringifyToolPayload(item.result),
    createdAt: Date.now(),
    status: item.status,
    metadata: {
      name: item.name,
      callId: item.callId,
      source: item.source
    }
  };
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

export function useCodexChat(options: UseCodexChatOptions = {}): UseCodexChatResult {
  const provider = useCodexProviderValue();
  const { thread, threadOptions, setThreadOptions, restoreThread } = useCodexThread(options);
  const [input, setInput] = useState(options.initialInput ?? "");
  const [messages, setMessages] = useState<CodexChatMessage[]>(options.initialMessages ?? []);
  const [events, setEvents] = useState<ThreadEvent[]>(options.initialEvents ?? []);
  const [rawEvents, setRawEvents] = useState(options.initialRawEvents ?? []);
  const [status, setStatus] = useState<CodexChatStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [usage, setUsage] = useState<UseCodexChatResult["usage"]>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<string | null>(null);
  const reloadStateRef = useRef<CodexChatSessionSnapshot | null>(null);
  const latestInputRef = useRef(input);
  const latestMessagesRef = useRef(messages);
  const latestEventsRef = useRef(events);
  const latestRawEventsRef = useRef(rawEvents);
  const latestUsageRef = useRef(usage);
  const latestErrorRef = useRef(error);
  const latestThreadOptionsRef = useRef(threadOptions);

  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    latestEventsRef.current = events;
  }, [events]);
  useEffect(() => {
    latestRawEventsRef.current = rawEvents;
  }, [rawEvents]);
  useEffect(() => {
    latestUsageRef.current = usage;
  }, [usage]);
  useEffect(() => {
    latestErrorRef.current = error;
  }, [error]);
  useEffect(() => {
    latestThreadOptionsRef.current = threadOptions;
  }, [threadOptions]);

  const applySession = useCallback((session: CodexChatSessionSnapshot) => {
    restoreThread(session.thread);
    startTransition(() => {
      setInput(session.input);
      setMessages(session.messages);
      setEvents(session.events);
      setRawEvents(session.rawEvents);
      setUsage(session.usage);
      setError(session.error ? new Error(session.error) : null);
      setStatus("ready");
    });
  }, [restoreThread]);

  useEffect(() => {
    if (!options.sessionId || !provider?.persistence?.loadSession) {
      return;
    }

    let cancelled = false;
    void Promise.resolve(provider.persistence.loadSession(options.sessionId)).then((session) => {
      if (cancelled || !session) {
        return;
      }

      applySession(session);
    });

    return () => {
      cancelled = true;
    };
  }, [applySession, options.sessionId, provider?.persistence]);

  const snapshotSession = useCallback((): CodexChatSessionSnapshot => ({
    id: options.sessionId ?? thread.id ?? "unsaved-session",
    thread: thread.snapshot(),
    input: latestInputRef.current,
    messages: latestMessagesRef.current,
    events: latestEventsRef.current,
    rawEvents: latestRawEventsRef.current,
    usage: latestUsageRef.current,
    error: latestErrorRef.current?.message ?? null,
    updatedAt: Date.now()
  }), [options.sessionId, thread]);

  useEffect(() => {
    if (!options.sessionId || !provider?.persistence?.saveSession) {
      return;
    }

    void provider.persistence.saveSession(snapshotSession());
  }, [messages, events, rawEvents, usage, input, error, thread, options.sessionId, provider?.persistence, snapshotSession]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus("idle");
  }, []);

  const restoreSession = useCallback((session: CodexChatSessionSnapshot) => {
    applySession(session);
  }, [applySession]);

  const reset = useCallback(() => {
    stop();
    const currentThreadOptions = latestThreadOptionsRef.current;
    const baseSnapshot = {
      threadId: null,
      lastResponseId: null,
      options: {}
    };
    restoreThread(baseSnapshot, {
      ...currentThreadOptions,
      threadId: null,
      lastResponseId: null
    });
    setInput(options.initialInput ?? "");
    setMessages([]);
    setEvents([]);
    setRawEvents([]);
    setStatus("idle");
    setError(null);
    setUsage(null);
    if (options.sessionId && provider?.persistence?.clearSession) {
      void provider.persistence.clearSession(options.sessionId);
    }
  }, [options.initialInput, options.sessionId, provider?.persistence, restoreThread, stop]);

  const sendMessage = useEffectEvent(async (nextInput?: string, runOptions: ThreadRunOptions = {}) => {
    if (status === "submitted" || status === "streaming") {
      throw new Error("A turn is already in progress");
    }

    const prompt = nextInput ?? latestInputRef.current;
    if (!prompt.trim()) {
      return;
    }

    const assistantMessageId = createId("assistant");
    reloadStateRef.current = snapshotSession();
    lastPromptRef.current = prompt;

    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = mergeSignal(controller.signal, runOptions.signal);

    setError(null);
    setUsage(null);
    setStatus("submitted");
    setMessages((current) => [
      ...current,
      {
        id: createId("user"),
        role: "user",
        content: prompt,
        createdAt: Date.now(),
        status: "ready"
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        status: "submitted"
      }
    ]);
    setInput("");

    try {
      const { events: streamedEvents } = await thread.runStreamed(prompt, {
        ...runOptions,
        signal
      });

      for await (const event of streamedEvents) {
        setEvents((current) => [...current, event]);
        options.onEvent?.(event);

        if (event.type === "raw.event") {
          setRawEvents((current) => [...current, event.event]);
          continue;
        }

        switch (event.type) {
          case "thread.started":
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
          case "item.completed": {
            const item = event.item;
            if (item.type === "agent_message") {
              setMessages((current) =>
                updateMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  content: item.text,
                  status: event.type === "item.completed" ? "ready" : "streaming",
                  metadata: {
                    item
                  }
                }))
              );
              break;
            }

            const normalized = normalizeItemMessage(item);
            if (normalized) {
              setMessages((current) => upsertMessageBefore(current, normalized, assistantMessageId));
            }
            if (item.type === "tool_call" && event.type === "item.completed") {
              setMessages((current) =>
                upsertMessageBefore(current, createToolResultMessage(item), assistantMessageId)
              );
            }
            break;
          }
          case "turn.completed": {
            setUsage(event.usage);
            setStatus("ready");
            let finalMessages: CodexChatMessage[] = [];
            setMessages((current) => {
              finalMessages = updateMessage(current, assistantMessageId, (message) => ({
                ...message,
                status: "ready",
                usage: event.usage
              }));
              return finalMessages;
            });
            options.onFinish?.({
              usage: event.usage,
              messages: finalMessages
            });
            break;
          }
          case "turn.failed": {
            const failure = new Error(event.error.message);
            setError(failure);
            setStatus("error");
            setMessages((current) => [
              ...current,
              {
                id: createId("error"),
                role: "error",
                content: event.error.message,
                createdAt: Date.now(),
                status: "error"
              }
            ]);
            options.onError?.(failure);
            break;
          }
          case "error": {
            const failure = new Error(event.message);
            setError(failure);
            setStatus("error");
            setMessages((current) => [
              ...current,
              {
                id: createId("error"),
                role: "error",
                content: event.message,
                createdAt: Date.now(),
                status: "error"
              }
            ]);
            options.onError?.(failure);
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
      }
    }
  });

  const reload = useCallback(async () => {
    if (!reloadStateRef.current || !lastPromptRef.current) {
      return;
    }

    restoreSession(reloadStateRef.current);
    await sendMessage(lastPromptRef.current);
  }, [restoreSession, sendMessage]);
  const setModel = useCallback((model?: string) => setThreadOptions({ model }), [setThreadOptions]);
  const setReasoning = useCallback((reasoning?: UseCodexChatResult["threadOptions"]["reasoning"]) => setThreadOptions({ reasoning }), [setThreadOptions]);
  const setTools = useCallback((tools: ToolDefinition[]) => setThreadOptions({ tools }), [setThreadOptions]);
  const setMcpServers = useCallback((mcpServers: McpServerDescriptor[]) => setThreadOptions({ mcpServers }), [setThreadOptions]);

  return {
    thread,
    messages,
    events,
    rawEvents,
    input,
    setInput,
    status,
    error,
    usage,
    threadId: thread.id,
    threadOptions,
    sendMessage,
    stop,
    reload,
    reset,
    setModel,
    setReasoning,
    setTools,
    setMcpServers,
    setThreadOptions,
    restoreSession,
    snapshotSession
  };
}
