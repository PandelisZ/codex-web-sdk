import { createMcpRegistry } from "../mcp/registry";
import { createFetchTransport } from "../core/transport";
import type {
  CodexOptions,
  CodexRuntimeKind,
  CreateMcpRegistryOptions,
  McpServerDescriptor,
  McpTransportAdapter,
  ResponsesTransport
} from "../types";
import { createHttpMcpAdapter, createSseMcpAdapter } from "../mcp/http";
import { createWebSocketMcpAdapter } from "../mcp/websocket";

export interface CodexRuntimeAdapter {
  readonly runtime: CodexRuntimeKind;
  createResponsesTransport(config: CodexOptions): ResponsesTransport;
  createMcpRegistry(config: Omit<CreateMcpRegistryOptions, "runtime" | "adapters">): ReturnType<typeof createMcpRegistry>;
  supportsMcpTransport(transport: McpServerDescriptor["transport"]): boolean;
}

function createBaseAdapters(runtime: CodexRuntimeKind): McpTransportAdapter[] {
  return [createHttpMcpAdapter(runtime), createSseMcpAdapter(runtime), createWebSocketMcpAdapter(runtime)];
}

export function createBrowserRuntimeAdapter(): CodexRuntimeAdapter {
  const adapters = createBaseAdapters("browser");
  return {
    runtime: "browser",
    createResponsesTransport(config) {
      return createFetchTransport(config);
    },
    createMcpRegistry(config) {
      return createMcpRegistry({
        ...config,
        runtime: "browser",
        adapters
      });
    },
    supportsMcpTransport(transport) {
      return adapters.some((adapter) => adapter.transport === transport);
    }
  };
}

export function createNodeRuntimeAdapter(
  adapters: McpTransportAdapter[] = []
): CodexRuntimeAdapter {
  const allAdapters = [...createBaseAdapters("node"), ...adapters];
  return {
    runtime: "node",
    createResponsesTransport(config) {
      return createFetchTransport(config);
    },
    createMcpRegistry(config) {
      return createMcpRegistry({
        ...config,
        runtime: "node",
        adapters: allAdapters
      });
    },
    supportsMcpTransport(transport) {
      return allAdapters.some((adapter) => adapter.transport === transport);
    }
  };
}
