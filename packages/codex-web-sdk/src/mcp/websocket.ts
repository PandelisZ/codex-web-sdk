import { assertRpcSuccess, createRpcRequest, toMcpInitializeParams } from "./rpc";
import type { CodexRuntimeKind, McpServerDescriptor, McpToolDescriptor, McpTransportAdapter } from "../types";

async function callWebSocket(server: Extract<McpServerDescriptor, { transport: "websocket" }>, body: unknown): Promise<unknown> {
  const WebSocketImpl = globalThis.WebSocket;
  if (!WebSocketImpl) {
    throw new Error("WebSocket is not available in this runtime");
  }

  return await new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(server.url, server.protocols);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(body));
    });
    socket.addEventListener("message", (event) => {
      socket.close();
      try {
        resolve(JSON.parse(String(event.data)));
      } catch (error) {
        reject(error);
      }
    });
    socket.addEventListener("error", () => {
      reject(new Error(`WebSocket MCP request failed for ${server.url}`));
    });
  });
}

function normalizeTools(server: McpServerDescriptor, result: unknown): McpToolDescriptor[] {
  const tools = ((result as { tools?: Array<Record<string, unknown>> })?.tools ?? []) as Array<
    Record<string, unknown>
  >;
  const serverName = server.name ?? server.id;
  return tools.map((tool) => ({
    id: `${server.id}:${String(tool.name)}`,
    serverId: server.id,
    serverName,
    name: String(tool.name),
    qualifiedName: `mcp__${server.id}__${String(tool.name)}`,
    description: tool.description ? String(tool.description) : undefined,
    inputSchema: (tool.inputSchema ?? tool.input_schema ?? tool.parameters ?? {
      type: "object"
    }) as McpToolDescriptor["inputSchema"],
    source: {
      kind: "mcp",
      serverId: server.id,
      serverName,
      toolName: String(tool.name)
    }
  }));
}

export function createWebSocketMcpAdapter(runtime: CodexRuntimeKind): McpTransportAdapter {
  return {
    runtime,
    transport: "websocket",
    async listTools(server) {
      if (server.transport !== "websocket") {
        return [];
      }

      assertRpcSuccess((await callWebSocket(server, createRpcRequest("initialize", toMcpInitializeParams()))) as never);
      const response = (await callWebSocket(server, createRpcRequest("tools/list"))) as never;
      return normalizeTools(server, assertRpcSuccess(response).result);
    },
    async callTool({ server, tool, input }) {
      if (server.transport !== "websocket") {
        throw new Error(`Adapter websocket cannot handle ${server.transport}`);
      }

      assertRpcSuccess((await callWebSocket(server, createRpcRequest("initialize", toMcpInitializeParams()))) as never);
      const response = (await callWebSocket(
        server,
        createRpcRequest("tools/call", {
          name: tool.name,
          arguments: (input ?? {}) as never
        })
      )) as never;
      return assertRpcSuccess(response).result;
    }
  };
}
