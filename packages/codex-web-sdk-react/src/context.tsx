import { createContext, useContext, useMemo } from "react";
import type { JSX } from "react";

import Codex from "@pandelis/codex-web-sdk";

import type { CodexProviderProps, CodexProviderValue } from "./types";

const CodexContext = createContext<CodexProviderValue | null>(null);

export function CodexProvider({ children, client, options = {}, persistence }: CodexProviderProps): JSX.Element {
  const value = useMemo(
    () => ({
      client: client ?? new Codex(options),
      defaultOptions: options,
      persistence
    }),
    [client, options, persistence]
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
