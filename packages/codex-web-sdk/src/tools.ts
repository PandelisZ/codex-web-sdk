import type { ToolDefinition } from "./types";

export function toTool<TInput = unknown, TResult = unknown>(
  definition: ToolDefinition<TInput, TResult>
): ToolDefinition<TInput, TResult> {
  return definition;
}

export const createTool = toTool;
