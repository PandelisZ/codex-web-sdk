import type {
  CodexOptions,
  LegacyCodexOptions,
  LegacyThreadOptions,
  ThreadOptions
} from "../types";

export function normalizeLegacyCodexOptions(options: CodexOptions | LegacyCodexOptions = {}): CodexOptions {
  const legacy = options as LegacyCodexOptions;
  const modern = options as CodexOptions;

  return {
    apiKey: modern.apiKey ?? legacy.apiKey,
    baseURL: modern.baseURL ?? legacy.baseUrl,
    defaultHeaders: modern.defaultHeaders ?? legacy.headers,
    defaultModel: modern.defaultModel ?? legacy.model,
    defaultReasoning: modern.defaultReasoning ?? legacy.reasoning,
    defaultInstructions: modern.defaultInstructions ?? legacy.systemPrompt,
    defaultMetadata: modern.defaultMetadata ?? legacy.metadata,
    defaultMcpServers: modern.defaultMcpServers ?? legacy.mcpServers,
    transport: modern.transport ?? legacy.transport,
    fetch: modern.fetch ?? legacy.fetch,
    wasmURL: modern.wasmURL ?? legacy.wasmUrl,
    maxToolRoundtrips: modern.maxToolRoundtrips ?? legacy.maxToolRoundtrips,
    runtimeAdapter: modern.runtimeAdapter ?? legacy.runtimeAdapter,
    mcpRegistry: modern.mcpRegistry ?? legacy.mcpRegistry,
    dangerouslyAllowBrowser: modern.dangerouslyAllowBrowser ?? legacy.dangerouslyAllowBrowser
  };
}

export function normalizeLegacyThreadOptions(options: ThreadOptions | LegacyThreadOptions = {}): ThreadOptions {
  const legacy = options as LegacyThreadOptions;
  const modern = options as ThreadOptions;

  return {
    model: modern.model ?? legacy.model,
    reasoning: modern.reasoning ?? legacy.reasoning,
    instructions: modern.instructions ?? legacy.systemPrompt,
    tools: modern.tools ?? legacy.tools,
    mcpServers: modern.mcpServers ?? legacy.mcpServers,
    metadata: modern.metadata ?? legacy.metadata,
    maxToolRoundtrips: modern.maxToolRoundtrips ?? legacy.maxToolRoundtrips,
    threadId: modern.threadId ?? legacy.threadId ?? null,
    lastResponseId: modern.lastResponseId ?? legacy.lastResponseId ?? null
  };
}
