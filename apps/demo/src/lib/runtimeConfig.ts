import type { CodexOptions, McpServerDescriptor, ReasoningConfig, ResponsesTransport } from "@pandelis/codex-web-sdk";
import type { ToolEditorValue } from "@pandelis/codex-web-sdk-ui";

import type { WorkspaceConfig, WorkspacePreset, WorkspaceSessionRecord } from "./storage";

export const DEFAULT_PROMPT = "";
export const DEFAULT_MODEL = "gpt-5.4";
export const DEFAULT_REASONING: ReasoningConfig = {
  effort: "medium",
  summary: "auto"
};
export const MODEL_OPTIONS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.1-codex",
  "gpt-4.1"
];

export type RuntimeConfig = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  reasoning?: ReasoningConfig;
  instructions?: string;
  initialInput?: string;
  tools?: ToolEditorValue[];
  mcpServers?: McpServerDescriptor[];
};

export type DemoAppProps = {
  wasmURL?: CodexOptions["wasmURL"];
  transport?: ResponsesTransport;
  initialInput?: string;
  codexOptions?: Partial<CodexOptions>;
};

export type WorkspacePaneProps = {
  wasmURL?: CodexOptions["wasmURL"];
  transport?: ResponsesTransport;
  codexOptions?: Partial<CodexOptions>;
  initialApiKey?: string;
  activeSessionId: string;
  onSessionsChange: (sessions: WorkspaceSessionRecord[]) => void;
  sessions: WorkspaceSessionRecord[];
  presets: WorkspacePreset[];
  onPresetsChange: (presets: WorkspacePreset[]) => void;
  runtimeDefaults: WorkspaceConfig;
};

type LegacyRuntimeConfig = RuntimeConfig & {
  baseUrl?: string;
  systemPrompt?: string;
};

declare global {
  interface Window {
    __PANDELIS_CODEX_WEB_CONFIG__?: RuntimeConfig | LegacyRuntimeConfig;
  }

  var __PANDELIS_CODEX_WEB_ENV_CONFIG__: RuntimeConfig | LegacyRuntimeConfig | undefined;
}

function normalizeLegacyRuntimeConfig(runtimeConfig: RuntimeConfig | LegacyRuntimeConfig): RuntimeConfig {
  return {
    apiKey: runtimeConfig.apiKey,
    baseURL: runtimeConfig.baseURL ?? runtimeConfig.baseUrl,
    model: runtimeConfig.model,
    reasoning: runtimeConfig.reasoning,
    instructions: runtimeConfig.instructions ?? runtimeConfig.systemPrompt,
    initialInput: runtimeConfig.initialInput,
    tools: runtimeConfig.tools,
    mcpServers: runtimeConfig.mcpServers
  };
}

function compactRuntimeConfig(runtimeConfig: RuntimeConfig): RuntimeConfig {
  return Object.fromEntries(
    Object.entries(runtimeConfig).filter(([, value]) => value !== undefined)
  ) as RuntimeConfig;
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getRuntimeConfig(): RuntimeConfig {
  const bundledConfig = normalizeLegacyRuntimeConfig(globalThis.__PANDELIS_CODEX_WEB_ENV_CONFIG__ ?? {});
  const windowConfig =
    typeof window === "undefined" ? {} : normalizeLegacyRuntimeConfig(window.__PANDELIS_CODEX_WEB_CONFIG__ ?? {});

  return {
    ...compactRuntimeConfig(bundledConfig),
    ...compactRuntimeConfig(windowConfig)
  };
}

export function createWorkspaceConfig(runtimeConfig: RuntimeConfig, initialInput?: string): WorkspaceConfig {
  return {
    baseURL: runtimeConfig.baseURL,
    model: runtimeConfig.model ?? DEFAULT_MODEL,
    reasoning: runtimeConfig.reasoning ?? DEFAULT_REASONING,
    instructions: runtimeConfig.instructions ?? "",
    prompt: initialInput ?? runtimeConfig.initialInput ?? DEFAULT_PROMPT,
    toolDrafts: runtimeConfig.tools ?? [],
    mcpServers: runtimeConfig.mcpServers ?? []
  };
}
