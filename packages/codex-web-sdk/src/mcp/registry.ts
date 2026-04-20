import type {
  CreateMcpRegistryOptions,
  McpServerDescriptor,
  McpServerStatus,
  McpToolDescriptor,
  McpTransportAdapter,
  ToolDefinition
} from "../types";

type ToolRecord = {
  descriptor: McpToolDescriptor;
  server: McpServerDescriptor;
};

function isNodeOnly(server: McpServerDescriptor): boolean {
  return server.transport === "stdio";
}

export class McpRegistry {
  private readonly adapters: McpTransportAdapter[];
  private servers: McpServerDescriptor[];
  private readonly toolCache = new Map<string, ToolRecord>();

  constructor(options: CreateMcpRegistryOptions = {}) {
    this.adapters = options.adapters ?? [];
    this.servers = options.servers ?? [];
  }

  setServers(servers: McpServerDescriptor[]): void {
    this.servers = servers;
    this.toolCache.clear();
  }

  private getServerList(servers?: McpServerDescriptor[]): McpServerDescriptor[] {
    return (servers ?? this.servers).filter((server) => server.enabled !== false);
  }

  private findAdapter(server: McpServerDescriptor): McpTransportAdapter | null {
    return this.adapters.find((adapter) => adapter.transport === server.transport) ?? null;
  }

  async listTools(options: { servers?: McpServerDescriptor[]; signal?: AbortSignal } = {}): Promise<McpToolDescriptor[]> {
    const tools: McpToolDescriptor[] = [];

    for (const server of this.getServerList(options.servers)) {
      const adapter = this.findAdapter(server);
      if (!adapter) {
        continue;
      }

      const serverTools = await adapter.listTools(server, options.signal);
      for (const tool of serverTools) {
        this.toolCache.set(tool.qualifiedName, {
          descriptor: tool,
          server
        });
        tools.push(tool);
      }
    }

    return tools;
  }

  async getServerStatuses(servers?: McpServerDescriptor[]): Promise<McpServerStatus[]> {
    const statuses: McpServerStatus[] = [];
    for (const server of this.getServerList(servers)) {
      const adapter = this.findAdapter(server);
      if (!adapter) {
        statuses.push({
          serverId: server.id,
          serverName: server.name ?? server.id,
          transport: server.transport,
          available: false,
          nodeOnly: isNodeOnly(server),
          reason: isNodeOnly(server) ? "Available only in the Node runtime adapter." : "No adapter is configured."
        });
        continue;
      }

      try {
        const tools = await adapter.listTools(server);
        for (const tool of tools) {
          this.toolCache.set(tool.qualifiedName, {
            descriptor: tool,
            server
          });
        }
        statuses.push({
          serverId: server.id,
          serverName: server.name ?? server.id,
          transport: server.transport,
          available: true,
          nodeOnly: isNodeOnly(server),
          toolCount: tools.length
        });
      } catch (error) {
        statuses.push({
          serverId: server.id,
          serverName: server.name ?? server.id,
          transport: server.transport,
          available: false,
          nodeOnly: isNodeOnly(server),
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return statuses;
  }

  asTools(descriptors: McpToolDescriptor[]): ToolDefinition[] {
    return descriptors.map((descriptor) => ({
      name: descriptor.qualifiedName,
      description: descriptor.description
        ? `${descriptor.description} (via MCP server ${descriptor.serverName})`
        : `Call the ${descriptor.name} MCP tool on ${descriptor.serverName}.`,
      inputSchema: descriptor.inputSchema,
      execute: async (input, context) => {
        const record = this.toolCache.get(descriptor.qualifiedName);
        if (!record) {
          throw new Error(`MCP tool "${descriptor.qualifiedName}" is not loaded`);
        }

        const adapter = this.findAdapter(record.server);
        if (!adapter) {
          throw new Error(`No MCP adapter is available for "${record.server.transport}"`);
        }

        return await adapter.callTool({
          server: record.server,
          tool: descriptor,
          input,
          signal: context.signal
        });
      }
    }));
  }

  async dispose(): Promise<void> {
    await Promise.all(
      this.adapters.map(async (adapter) => {
        await adapter.dispose?.();
      })
    );
  }
}

export function createMcpRegistry(options: CreateMcpRegistryOptions = {}): McpRegistry {
  return new McpRegistry(options);
}
