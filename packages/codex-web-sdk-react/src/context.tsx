import { createContext, useContext, useMemo } from "react";
import type { JSX } from "react";

import { createCodexClient } from "@pandelis/codex-web-sdk";

import type { CodexProviderProps, CodexProviderValue } from "./types";

const CodexContext = createContext<CodexProviderValue | null>(null);

export function CodexProvider({ children, client, config = {}, persistence }: CodexProviderProps): JSX.Element {
  const value = useMemo(
    () => ({
      client: client ?? createCodexClient(config),
      defaultConfig: config,
      persistence
    }),
    [client, config, persistence]
  );

  return <CodexContext.Provider value={value}>{children}</CodexContext.Provider>;
}

export function useCodexProviderValue(): CodexProviderValue | null {
  return useContext(CodexContext);
}

export function useCodexClient(): CodexProviderValue["client"] {
  const value = useCodexProviderValue();
  if (!value) {
    throw new Error("useCodexClient must be used inside CodexProvider or receive a client directly.");
  }

  return value.client;
}
