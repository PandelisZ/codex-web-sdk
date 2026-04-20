import type { ToolDefinition } from "./types";

export function createTool<TInput = unknown, TResult = unknown>(
  definition: ToolDefinition<TInput, TResult>
): ToolDefinition<TInput, TResult> {
  return definition;
}
