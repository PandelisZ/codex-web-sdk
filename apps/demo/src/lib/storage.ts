import type { McpServerDescriptor, ReasoningConfig } from "@pandelis/codex-web-sdk";
import type { CodexChatSessionSnapshot } from "@pandelis/codex-web-sdk-react";
import type { ToolEditorValue } from "@pandelis/codex-web-sdk-ui";

const API_KEY_STORAGE_KEY = "pandelis-codex-web-sdk-openai-api-key";
const PRESETS_STORAGE_KEY = "pandelis-codex-web-sdk-presets";
const SESSIONS_STORAGE_KEY = "pandelis-codex-web-sdk-sessions";

export type WorkspaceConfig = {
  baseUrl?: string;
  model: string;
  reasoning: ReasoningConfig;
  systemPrompt: string;
  prompt: string;
  toolDrafts: ToolEditorValue[];
  mcpServers: McpServerDescriptor[];
};

export type WorkspacePreset = {
  id: string;
  name: string;
  config: WorkspaceConfig;
  updatedAt: number;
};

export type WorkspaceSessionRecord = {
  id: string;
  name: string;
  workspace: WorkspaceConfig;
  chat: CodexChatSessionSnapshot | null;
  updatedAt: number;
};

function readJson<T>(key: string, fallback: T): T {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.setItem !== "function"
  ) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readStoredApiKey(): string {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.getItem !== "function"
  ) {
    return "";
  }

  return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function writeStoredApiKey(value: string): void {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage?.setItem !== "function" ||
    typeof window.localStorage?.removeItem !== "function"
  ) {
    return;
  }

  if (value) {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

export function loadPresets(): WorkspacePreset[] {
  return readJson(PRESETS_STORAGE_KEY, [] as WorkspacePreset[]);
}

export function savePresets(presets: WorkspacePreset[]): void {
  writeJson(PRESETS_STORAGE_KEY, presets);
}

export function loadSessions(): WorkspaceSessionRecord[] {
  return readJson(SESSIONS_STORAGE_KEY, [] as WorkspaceSessionRecord[]);
}

export function saveSessions(sessions: WorkspaceSessionRecord[]): void {
  writeJson(SESSIONS_STORAGE_KEY, sessions);
}

export function loadSessionRecord(id: string): WorkspaceSessionRecord | null {
  return loadSessions().find((session) => session.id === id) ?? null;
}

export function upsertSessionRecord(session: WorkspaceSessionRecord): WorkspaceSessionRecord[] {
  const sessions = loadSessions();
  const existingIndex = sessions.findIndex((entry) => entry.id === session.id);
  const next =
    existingIndex >= 0
      ? sessions.map((entry, index) => (index === existingIndex ? session : entry))
      : [session, ...sessions];
  saveSessions(next);
  return next;
}

export function saveWorkspaceSnapshot(args: {
  id: string;
  name: string;
  workspace: WorkspaceConfig;
  chat: CodexChatSessionSnapshot | null;
}): WorkspaceSessionRecord[] {
  return upsertSessionRecord({
    id: args.id,
    name: args.name,
    workspace: args.workspace,
    chat: args.chat,
    updatedAt: Date.now()
  });
}

export function removeSessionRecord(id: string): WorkspaceSessionRecord[] {
  const next = loadSessions().filter((session) => session.id !== id);
  saveSessions(next);
  return next;
}
