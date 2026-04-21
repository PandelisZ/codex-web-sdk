import { useCallback, useEffect, useRef, useState } from "react";

import Codex from "@pandelis/codex-web-sdk";

import { useCodexProviderValue } from "./context";
import type { UseCodexThreadOptions, UseCodexThreadResult } from "./types";

export function useCodexThread(options: UseCodexThreadOptions = {}): UseCodexThreadResult {
  const provider = useCodexProviderValue();
  const resolvedClient =
    options.client ??
    provider?.client ??
    new Codex({
      ...(provider?.defaultOptions ?? {})
    });
  const initialThreadOptions = {
    model: provider?.defaultOptions.defaultModel,
    reasoning: provider?.defaultOptions.defaultReasoning,
    instructions: provider?.defaultOptions.defaultInstructions,
    metadata: provider?.defaultOptions.defaultMetadata,
    mcpServers: provider?.defaultOptions.defaultMcpServers,
    maxToolRoundtrips: provider?.defaultOptions.maxToolRoundtrips,
    ...(options.threadOptions ?? {})
  };
  const threadRef = useRef(options.thread ?? resolvedClient.threads.create(initialThreadOptions));
  const [threadOptions, setThreadOptionsState] = useState(threadRef.current.getOptions());

  const setThreadOptions = useCallback((update: Parameters<UseCodexThreadResult["setThreadOptions"]>[0]) => {
    const nextThreadOptions = threadRef.current.update(update);
    setThreadOptionsState({ ...nextThreadOptions });
  }, []);

  const restoreThread = useCallback((snapshot: Parameters<UseCodexThreadResult["restoreThread"]>[0], update = {}) => {
    threadRef.current.restore(snapshot, update);
    setThreadOptionsState({ ...threadRef.current.getOptions() });
  }, []);

  useEffect(() => {
    if (options.thread || options.client === undefined) {
      return;
    }

    const snapshot = threadRef.current.snapshot();
    const nextThread = resolvedClient.threads.create(threadRef.current.getOptions());
    nextThread.restore(snapshot);
    threadRef.current = nextThread;
    setThreadOptionsState({ ...nextThread.getOptions() });
  }, [options.client, options.thread, resolvedClient]);

  useEffect(() => {
    if (!options.snapshot || threadRef.current.id === options.snapshot.threadId) {
      return;
    }

    threadRef.current.restore(options.snapshot);
    setThreadOptionsState({ ...threadRef.current.getOptions() });
  }, [options.snapshot]);

  return {
    client: resolvedClient,
    thread: threadRef.current,
    threadOptions,
    setThreadOptions,
    restoreThread,
    snapshot: threadRef.current.snapshot()
  };
}
