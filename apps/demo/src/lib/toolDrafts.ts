import { createTool } from "@pandelis/codex-web-sdk";
import type { ToolDefinition } from "@pandelis/codex-web-sdk";
import type { ToolEditorValue } from "@pandelis/codex-web-sdk-ui";

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

export function toolDraftsToDefinitions(drafts: ToolEditorValue[]): ToolDefinition[] {
  return drafts
    .filter((draft) => draft.name.trim())
    .map((draft) =>
      createTool({
        name: draft.name.trim(),
        description: draft.description?.trim() || undefined,
        inputSchema: safeParseJson(draft.inputSchema, {
          type: "object"
        }) as ToolDefinition["inputSchema"],
        execute: async () => safeParseJson(draft.output, {
          ok: true
        })
      })
    );
}
