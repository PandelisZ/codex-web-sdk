import { describe, expect, it } from "vitest";

import { getRuntimeConfig } from "./lib/runtimeConfig";
import {
  loadPresets,
  loadSessions,
  readStoredApiKey,
  savePresets,
  upsertSessionRecord,
  writeStoredApiKey
} from "./lib/storage";

describe("demo workspace persistence helpers", () => {
  function installLocalStorageStub() {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
        removeItem(key: string) {
          store.delete(key);
        }
      }
    });
  }

  function resetRuntimeConfig() {
    delete globalThis.__PANDELIS_CODEX_WEB_ENV_CONFIG__;
    delete window.__PANDELIS_CODEX_WEB_CONFIG__;
  }

  it("persists API keys, presets, and sessions", () => {
    resetRuntimeConfig();
    installLocalStorageStub();

    writeStoredApiKey("sk-demo");
    savePresets([
      {
        id: "preset_1",
        name: "Workspace preset",
        updatedAt: 1,
        config: {
          model: "gpt-5.1-codex",
          reasoning: {
            effort: "medium",
            summary: "auto"
          },
          systemPrompt: "",
          prompt: "hello",
          toolDrafts: [],
          mcpServers: []
        }
      }
    ]);
    upsertSessionRecord({
      id: "session_1",
      name: "Current workspace",
      updatedAt: 1,
      workspace: {
        model: "gpt-5.1-codex",
        reasoning: {
          effort: "medium",
          summary: "auto"
        },
        systemPrompt: "",
        prompt: "hello",
        toolDrafts: [],
        mcpServers: []
      },
      chat: null
    });

    expect(readStoredApiKey()).toBe("sk-demo");
    expect(loadPresets()).toHaveLength(1);
    expect(loadSessions()).toHaveLength(1);
  });

  it("falls back to the bundled env API key and lets window config override other fields", () => {
    resetRuntimeConfig();
    globalThis.__PANDELIS_CODEX_WEB_ENV_CONFIG__ = {
      apiKey: "sk-env",
      model: "gpt-4.1"
    };
    window.__PANDELIS_CODEX_WEB_CONFIG__ = {
      model: "gpt-5.4",
      initialInput: "hello"
    };

    expect(getRuntimeConfig()).toEqual({
      apiKey: "sk-env",
      model: "gpt-5.4",
      initialInput: "hello"
    });
  });
});
