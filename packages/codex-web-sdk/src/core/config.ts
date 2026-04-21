import { normalizeLegacyCodexOptions, normalizeLegacyThreadOptions } from "../internal/compat";
import type {
  CodexOptions,
  NormalizedCodexOptions,
  SerializableHeaders,
  SerializableThreadOptions,
  ThreadOptions,
  ThreadSnapshot,
  ThreadUpdate
} from "../types";

export function normalizeCodexOptions(options: CodexOptions = {}): NormalizedCodexOptions {
  const normalized = normalizeLegacyCodexOptions(options);
  return {
    apiKey: normalized.apiKey,
    baseURL: normalized.baseURL,
    defaultHeaders: normalized.defaultHeaders,
    defaultModel: normalized.defaultModel,
    defaultReasoning: normalized.defaultReasoning,
    defaultInstructions: normalized.defaultInstructions,
    defaultMetadata: normalized.defaultMetadata,
    defaultMcpServers: normalized.defaultMcpServers,
    transport: normalized.transport,
    fetch: normalized.fetch,
    wasmURL: normalized.wasmURL,
    maxToolRoundtrips: normalized.maxToolRoundtrips,
    runtimeAdapter: normalized.runtimeAdapter,
    mcpRegistry: normalized.mcpRegistry
  };
}

export function createThreadOptions(
  clientOptions: NormalizedCodexOptions,
  threadOptions: ThreadOptions = {}
): ThreadOptions {
  const normalized = normalizeLegacyThreadOptions(threadOptions);
  return {
    model: normalized.model ?? clientOptions.defaultModel,
    reasoning: normalized.reasoning ?? clientOptions.defaultReasoning,
    instructions: normalized.instructions ?? clientOptions.defaultInstructions,
    tools: normalized.tools,
    mcpServers: normalized.mcpServers ?? clientOptions.defaultMcpServers,
    metadata: normalized.metadata ?? clientOptions.defaultMetadata,
    maxToolRoundtrips: normalized.maxToolRoundtrips ?? clientOptions.maxToolRoundtrips,
    threadId: normalized.threadId ?? null,
    lastResponseId: normalized.lastResponseId ?? null
  };
}

export function mergeThreadOptions(base: ThreadOptions, update: ThreadUpdate = {}): ThreadOptions {
  const rawUpdate = update as ThreadUpdate & {
    systemPrompt?: string;
  };
  const normalized = normalizeLegacyThreadOptions(update);
  const normalizedUpdate: ThreadUpdate = {};

  if ("model" in rawUpdate) {
    normalizedUpdate.model = normalized.model;
  }
  if ("reasoning" in rawUpdate) {
    normalizedUpdate.reasoning = normalized.reasoning;
  }
  if ("instructions" in rawUpdate || "systemPrompt" in rawUpdate) {
    normalizedUpdate.instructions = normalized.instructions;
  }
  if ("tools" in rawUpdate) {
    normalizedUpdate.tools = normalized.tools;
  }
  if ("mcpServers" in rawUpdate) {
    normalizedUpdate.mcpServers = normalized.mcpServers;
  }
  if ("metadata" in rawUpdate) {
    normalizedUpdate.metadata = normalized.metadata;
  }
  if ("maxToolRoundtrips" in rawUpdate) {
    normalizedUpdate.maxToolRoundtrips = normalized.maxToolRoundtrips;
  }
  if ("threadId" in rawUpdate) {
    normalizedUpdate.threadId = normalized.threadId;
  }
  if ("lastResponseId" in rawUpdate) {
    normalizedUpdate.lastResponseId = normalized.lastResponseId;
  }

  return {
    ...base,
    ...normalizedUpdate,
    reasoning: normalizedUpdate.reasoning ?? base.reasoning,
    tools: normalizedUpdate.tools ?? base.tools,
    mcpServers: normalizedUpdate.mcpServers ?? base.mcpServers,
    metadata: normalizedUpdate.metadata ?? base.metadata,
    threadId: normalizedUpdate.threadId ?? base.threadId ?? null,
    lastResponseId: normalizedUpdate.lastResponseId ?? base.lastResponseId ?? null
  };
}

export function normalizeHeaders(headers?: HeadersInit): SerializableHeaders | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

export function toSerializableThreadOptions(options: ThreadOptions): SerializableThreadOptions {
  return {
    model: options.model,
    reasoning: options.reasoning,
    instructions: options.instructions,
    mcpServers: options.mcpServers,
    metadata: options.metadata,
    maxToolRoundtrips: options.maxToolRoundtrips
  };
}

export function snapshotFromThreadOptions(options: ThreadOptions): ThreadSnapshot {
  return {
    threadId: options.threadId ?? null,
    lastResponseId: options.lastResponseId ?? null,
    options: toSerializableThreadOptions(options)
  };
}
