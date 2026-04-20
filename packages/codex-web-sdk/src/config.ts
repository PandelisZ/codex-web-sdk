import type {
  CodexClientConfig,
  CodexThreadConfig,
  SerializableHeaders,
  SerializableThreadConfig,
  ThreadConfigUpdate,
  ThreadSnapshot
} from "./types";

export function mergeThreadConfig(
  base: CodexThreadConfig,
  update: ThreadConfigUpdate = {}
): CodexThreadConfig {
  return {
    ...base,
    ...update,
    headers: update.headers ?? base.headers,
    reasoning: update.reasoning ?? base.reasoning,
    tools: update.tools ?? base.tools,
    mcpServers: update.mcpServers ?? base.mcpServers,
    metadata: update.metadata ?? base.metadata,
    transport: update.transport ?? base.transport,
    fetch: update.fetch ?? base.fetch,
    runtimeAdapter: update.runtimeAdapter ?? base.runtimeAdapter,
    mcpRegistry: update.mcpRegistry ?? base.mcpRegistry,
    threadId: update.threadId ?? base.threadId ?? null,
    lastResponseId: update.lastResponseId ?? base.lastResponseId ?? null
  };
}

export function createThreadConfig(
  clientConfig: CodexClientConfig = {},
  threadConfig: CodexThreadConfig = {}
): CodexThreadConfig {
  return mergeThreadConfig(
    {
      ...clientConfig,
      threadId: null,
      lastResponseId: null
    },
    threadConfig
  );
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

export function toSerializableThreadConfig(config: CodexThreadConfig): SerializableThreadConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    headers: normalizeHeaders(config.headers),
    model: config.model,
    reasoning: config.reasoning,
    systemPrompt: config.systemPrompt,
    mcpServers: config.mcpServers,
    metadata: config.metadata,
    maxToolRoundtrips: config.maxToolRoundtrips
  };
}

export function snapshotFromConfig(config: CodexThreadConfig): ThreadSnapshot {
  return {
    threadId: config.threadId ?? null,
    lastResponseId: config.lastResponseId ?? null,
    config: toSerializableThreadConfig(config)
  };
}
