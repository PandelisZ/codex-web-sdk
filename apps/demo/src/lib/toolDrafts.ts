import Codex, { toTool } from "@pandelis/codex-web-sdk";
import type { CodexOptions, ToolDefinition, ToolExecutionContext } from "@pandelis/codex-web-sdk";
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
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json|javascript|js|ts)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trimmed
    .replace(/^```(?:json|javascript|js|ts)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractJsonObject(text: string): string {
  const normalized = stripCodeFence(text);
  try {
    JSON.parse(normalized);
    return normalized;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = normalized.slice(start, end + 1);
      JSON.parse(candidate);
      return candidate;
    }
    throw new Error("Model did not return valid JSON.");
  }
}

function extractJavaScript(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:javascript|js|ts)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : stripCodeFence(trimmed);
  if (!candidate) {
    throw new Error("Model did not return any JavaScript.");
  }

  return candidate;
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

function createGenerationClient(args: {
  options: Pick<
    CodexOptions,
    "apiKey" | "baseURL" | "defaultHeaders" | "defaultModel" | "defaultReasoning" | "fetch" | "transport"
  >;
  wasmURL?: unknown;
}): Codex {
  return new Codex({
    apiKey: args.options.apiKey,
    baseURL: args.options.baseURL,
    defaultHeaders: args.options.defaultHeaders,
    defaultModel: args.options.defaultModel,
    defaultReasoning: args.options.defaultReasoning,
    fetch: args.options.fetch,
    transport: args.options.transport,
    wasmURL: args.wasmURL
  });
}

export function createEmptyBrowserTool(): ToolEditorValue {
  return {
    id: `tool_${Math.random().toString(36).slice(2)}`,
    runtime: "browser-js",
    name: "",
    description: "",
    schemaDescription: "",
    codeDescription: "",
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

      return toTool({
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
  toolName?: string;
  toolDescription?: string;
  options: Pick<
    CodexOptions,
    "apiKey" | "baseURL" | "defaultHeaders" | "defaultModel" | "defaultReasoning" | "fetch" | "transport"
  >;
  wasmURL?: unknown;
}): Promise<string> {
  const description = args.description.trim();
  if (!description) {
    throw new Error("Write a plain-English schema description first.");
  }

  const client = createGenerationClient(args);
  const thread = client.threads.create();
  const result = await thread.run(
    [
      "Generate a JSON Schema object for a browser-executed tool input.",
      "Return only a JSON object. No prose. No markdown fences.",
      "The top-level schema must be { type: \"object\", ... }.",
      "Prefer explicit properties, required, enum, description, and additionalProperties when useful.",
      args.toolName ? `Tool name: ${args.toolName}` : "",
      args.toolDescription ? `Tool description: ${args.toolDescription}` : "",
      `Input requirements: ${description}`
    ]
      .filter(Boolean)
      .join("\n")
  );

  const parsed = JSON.parse(extractJsonObject(result.finalResponse));
  return prettyJson(parsed);
}

export async function generateToolCodeFromDescription(args: {
  name: string;
  description?: string;
  codeDescription: string;
  inputSchema?: string;
  existingCode?: string;
  options: Pick<
    CodexOptions,
    "apiKey" | "baseURL" | "defaultHeaders" | "defaultModel" | "defaultReasoning" | "fetch" | "transport"
  >;
  wasmURL?: unknown;
}): Promise<string> {
  const codeDescription = args.codeDescription.trim();
  if (!codeDescription) {
    throw new Error("Write what the generated tool code should do first.");
  }

  const client = createGenerationClient(args);
  const thread = client.threads.create();
  const result = await thread.run(
    [
      "Write JavaScript for the body of an async browser tool.",
      "Return only JavaScript source. No prose. No markdown fences.",
      "Do not include a function declaration or wrapper.",
      "The code runs inside an async function with access to: input, context, window, document, fetch, localStorage, sessionStorage, console, URL, URLSearchParams, setTimeout, clearTimeout, crypto.",
      "Return a JSON-serializable value.",
      "Throw an Error when required inputs are missing or invalid.",
      args.name ? `Tool name: ${args.name}` : "",
      args.description ? `Tool description: ${args.description}` : "",
      args.inputSchema?.trim() ? `Input schema:\n${args.inputSchema.trim()}` : "",
      args.existingCode?.trim() ? `Existing code to refine:\n${args.existingCode.trim()}` : "",
      `Requested behavior:\n${codeDescription}`
    ]
      .filter(Boolean)
      .join("\n\n")
  );

  return extractJavaScript(result.finalResponse);
}
