import { createBrowserRuntimeAdapter } from "../../runtime/adapters";
import type { McpRegistry } from "../../mcp/registry";
import type { NormalizedCodexOptions, ResponsesTransport } from "../../types";

export class ThreadClient {
  private readonly runtimeAdapter;
  private transport: ResponsesTransport | null = null;
  private registry: McpRegistry | null = null;

  constructor(private readonly options: NormalizedCodexOptions) {
    this.runtimeAdapter = this.options.runtimeAdapter ?? createBrowserRuntimeAdapter();
  }

  getOptions(): NormalizedCodexOptions {
    return this.options;
  }

  getTransport(): ResponsesTransport {
    if (this.options.transport) {
      return this.options.transport;
    }

    if (this.transport) {
      return this.transport;
    }

    this.transport = this.runtimeAdapter.createResponsesTransport(this.options);
    return this.transport;
  }

  getRegistry(servers: NonNullable<NormalizedCodexOptions["defaultMcpServers"]> = []): McpRegistry {
    if (this.options.mcpRegistry) {
      return this.options.mcpRegistry;
    }

    if (this.registry) {
      this.registry.setServers(servers);
      return this.registry;
    }

    this.registry = this.runtimeAdapter.createMcpRegistry({ servers });
    return this.registry;
  }
}
