import { createCodexClient, createTool } from "@pandelis/codex-web-sdk";
import type { CodexClientConfig, ToolDefinition, ToolExecutionContext } from "@pandelis/codex-web-sdk";
import type { ToolEditorValue } from "@pandelis/codex-web-sdk-ui";

const DEFAULT_TOOL_CODE = `// input contains the parsed tool arguments.\n// context includes threadId, callId, step, and AbortSignal.\nconst city = input.city ?? "Limassol"\n\nreturn {\n  city,\n  time: new Date().toISOString(),\n  note: "This result was generated in the browser."\n}\n`;

function safeParseJson(text: string | undefined, fallback: unknown): unknown {
  if (!text?.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function compileBrowserTool(code: string) {
  const runner = new Function(
    "input",
    "context",
    "browser",
    `"use strict";
const { window, document, fetch, localStorage, sessionStorage, console, URL, URLSearchParams, setTimeout, clearTimeout, crypto } = browser;
return (async () => {
${code}
})();`
  ) as (
    input: unknown,
    context: ToolExecutionContext,
    browser: Record<string, unknown>
  ) => Promise<unknown>;

  return async (input: unknown, context: ToolExecutionContext): Promise<unknown> =>
    await runner(input, context, {
      window,
      document,
      fetch: globalThis.fetch.bind(globalThis),
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      console,
      URL,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      crypto
    });
}

export function createEmptyBrowserTool(): ToolEditorValue {
  return {
    id: `tool_${Math.random().toString(36).slice(2)}`,
    runtime: "browser-js",
    name: "",
    description: "",
    schemaDescription: "",
    inputSchema: prettyJson({
      type: "object",
      properties: {}
    }),
    code: DEFAULT_TOOL_CODE
  };
}

export function toolDraftsToDefinitions(drafts: ToolEditorValue[]): ToolDefinition[] {
  return drafts
    .filter((draft) => draft.name.trim())
    .map((draft) => {
      const execute = draft.code?.trim()
        ? compileBrowserTool(draft.code)
        : async () =>
            safeParseJson(draft.output, {
              ok: true
            });

      return createTool({
        name: draft.name.trim(),
        description: draft.description?.trim() || undefined,
        inputSchema: safeParseJson(draft.inputSchema, {
          type: "object"
        }) as ToolDefinition["inputSchema"],
        execute
      });
    });
}

export async function generateToolSchemaFromDescription(args: {
  description: string;
  config: Pick<CodexClientConfig, "apiKey" | "baseUrl" | "headers" | "model" | "reasoning" | "fetch">;
  wasmUrl?: unknown;
}): Promise<string> {
  const description = args.description.trim();
  if (!description) {
    throw new Error("Write a plain-English schema description first.");
  }

  const client = createCodexClient({
    apiKey: args.config.apiKey,
    baseUrl: args.config.baseUrl,
    headers: args.config.headers,
    model: args.config.model,
    reasoning: args.config.reasoning,
    fetch: args.config.fetch,
    wasmUrl: args.wasmUrl
  });

  const thread = client.startThread();
  const result = await thread.run(
    [
      "Generate a JSON Schema object for a browser tool input.",
      "Return only valid JSON.",
      "Do not wrap the JSON in markdown fences.",
      "Use type: object at the top level.",
      `Description: ${description}`
    ].join("\n")
  );

  const parsed = JSON.parse(stripCodeFence(result.finalResponse));
  return prettyJson(parsed);
}
