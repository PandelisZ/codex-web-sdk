import type { AgentOptions, McpServerDescriptor, ReasoningConfig, ResponsesTransport } from "@pandelis/codex-web-sdk";
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
  baseUrl?: string;
  model?: string;
  reasoning?: ReasoningConfig;
  systemPrompt?: string;
  initialInput?: string;
  tools?: ToolEditorValue[];
  mcpServers?: McpServerDescriptor[];
};

export type DemoAppProps = {
  wasmUrl?: AgentOptions["wasmUrl"];
  transport?: ResponsesTransport;
  initialInput?: string;
  agentOptions?: Partial<AgentOptions>;
};

export type WorkspacePaneProps = {
  wasmUrl?: AgentOptions["wasmUrl"];
  transport?: ResponsesTransport;
  agentOptions?: Partial<AgentOptions>;
  initialApiKey?: string;
  activeSessionId: string;
  onSessionsChange: (sessions: WorkspaceSessionRecord[]) => void;
  sessions: WorkspaceSessionRecord[];
  presets: WorkspacePreset[];
  onPresetsChange: (presets: WorkspacePreset[]) => void;
  runtimeDefaults: WorkspaceConfig;
};

declare global {
  interface Window {
    __PANDELIS_CODEX_WEB_CONFIG__?: RuntimeConfig;
  }

  var __PANDELIS_CODEX_WEB_ENV_CONFIG__: RuntimeConfig | undefined;
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getRuntimeConfig(): RuntimeConfig {
  const bundledConfig = globalThis.__PANDELIS_CODEX_WEB_ENV_CONFIG__ ?? {};
  const windowConfig =
    typeof window === "undefined" ? {} : (window.__PANDELIS_CODEX_WEB_CONFIG__ ?? {});

  return {
    ...bundledConfig,
    ...windowConfig
  };
}

export function createWorkspaceConfig(runtimeConfig: RuntimeConfig, initialInput?: string): WorkspaceConfig {
  return {
    baseUrl: runtimeConfig.baseUrl,
    model: runtimeConfig.model ?? DEFAULT_MODEL,
    reasoning: runtimeConfig.reasoning ?? DEFAULT_REASONING,
    systemPrompt: runtimeConfig.systemPrompt ?? "",
    prompt: initialInput ?? runtimeConfig.initialInput ?? DEFAULT_PROMPT,
    toolDrafts: runtimeConfig.tools ?? [],
    mcpServers: runtimeConfig.mcpServers ?? []
  };
}
