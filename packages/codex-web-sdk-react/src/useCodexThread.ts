import { useCallback, useEffect, useRef, useState } from "react";

import { createCodexClient } from "@pandelis/codex-web-sdk";

import { useCodexProviderValue } from "./context";
import type { UseCodexThreadOptions, UseCodexThreadResult } from "./types";

export function useCodexThread(options: UseCodexThreadOptions = {}): UseCodexThreadResult {
  const provider = useCodexProviderValue();
  const resolvedClient =
    options.client ??
    provider?.client ??
    createCodexClient({
      ...(provider?.defaultConfig ?? {})
    });
  const initialConfig = {
    ...(provider?.defaultConfig ?? {}),
    ...(options.config ?? {})
  };
  const threadRef = useRef(options.thread ?? resolvedClient.startThread(initialConfig));
  const [config, setConfigState] = useState(threadRef.current.getConfig());

  const setConfig = useCallback((update: Parameters<UseCodexThreadResult["setConfig"]>[0]) => {
    const nextConfig = threadRef.current.setConfig(update);
    setConfigState({ ...nextConfig });
  }, []);

  const restoreThread = useCallback((snapshot: Parameters<UseCodexThreadResult["restoreThread"]>[0], update = {}) => {
    threadRef.current.restore(snapshot, update);
    setConfigState({ ...threadRef.current.getConfig() });
  }, []);

  useEffect(() => {
    if (!options.snapshot || threadRef.current.id === options.snapshot.threadId) {
      return;
    }

    threadRef.current.restore(options.snapshot);
    setConfigState({ ...threadRef.current.getConfig() });
  }, [options.snapshot]);

  return {
    client: resolvedClient,
    thread: threadRef.current,
    config,
    setConfig,
    restoreThread,
    snapshot: threadRef.current.snapshot()
  };
}
