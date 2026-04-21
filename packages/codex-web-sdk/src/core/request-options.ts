import type { ThreadOptions } from "../types";

function toReasoningSummary(summary: unknown): string | undefined {
  if (summary === undefined || summary === null) {
    return undefined;
  }

  if (summary === true) {
    return "auto";
  }

  if (summary === false) {
    return "none";
  }

  return typeof summary === "string" ? summary : undefined;
}

export function buildRequestBody(
  request: Record<string, unknown>,
  options: ThreadOptions,
  lastResponseId: string | null
): Record<string, unknown> {
  const body = { ...request };

  if (options.model) {
    body.model = options.model;
  }

  if (options.instructions) {
    body.instructions = options.instructions;
  } else {
    delete body.instructions;
  }

  if (options.reasoning) {
    body.reasoning = {
      effort: options.reasoning.effort,
      ...(options.reasoning.summary !== undefined
        ? { summary: toReasoningSummary(options.reasoning.summary) }
        : {})
    };
  } else {
    delete body.reasoning;
  }

  if (options.metadata) {
    body.metadata = options.metadata;
  } else {
    delete body.metadata;
  }

  if (lastResponseId) {
    body.previous_response_id = lastResponseId;
  }

  return body;
}
