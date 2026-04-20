import { assertRpcSuccess, createRpcRequest, toMcpInitializeParams } from "./rpc";
import type {
  CodexRuntimeKind,
  McpServerDescriptor,
  McpToolDescriptor,
  McpTransportAdapter,
  RawResponsesStreamEvent
} from "../types";

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const events: RawResponsesStreamEvent[] = [];
    if (!response.body) {
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const data = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (!data || data === "[DONE]") {
          continue;
        }

        events.push(JSON.parse(data) as RawResponsesStreamEvent);
      }

      if (done) {
        break;
      }
    }

    return events.at(-1) ?? null;
  }

  return await response.json();
}

async function postRpc(
  server: Extract<McpServerDescriptor, { url: string }>,
  body: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(server.headers ?? {})
    },
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await readJsonResponse(response);
}

async function initialize(server: Extract<McpServerDescriptor, { url: string }>, signal?: AbortSignal): Promise<void> {
  const response = (await postRpc(server, createRpcRequest("initialize", toMcpInitializeParams()), signal)) as {
    jsonrpc: "2.0";
    id: number;
    result?: unknown;
    error?: { message: string };
  };
  assertRpcSuccess(response as never);
}

function normalizeTools(
  server: McpServerDescriptor,
  result: unknown
): McpToolDescriptor[] {
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

function createRemoteMcpAdapter(
  runtime: CodexRuntimeKind,
  transport: "streamable-http" | "sse"
): McpTransportAdapter {
  return {
    runtime,
    transport,
    async listTools(server, signal) {
      if (server.transport !== transport) {
        return [];
      }

      await initialize(server, signal);
      const response = (await postRpc(server, createRpcRequest("tools/list"), signal)) as {
        jsonrpc: "2.0";
        id: number;
        result?: unknown;
        error?: { message: string };
      };
      return normalizeTools(server, assertRpcSuccess(response as never).result);
    },
    async callTool({ server, tool, input, signal }) {
      if (server.transport !== transport) {
        throw new Error(`Adapter ${transport} cannot handle ${server.transport}`);
      }

      await initialize(server, signal);
      const response = (await postRpc(
        server,
        createRpcRequest("tools/call", {
          name: tool.name,
          arguments: (input ?? {}) as never
        }),
        signal
      )) as {
        jsonrpc: "2.0";
        id: number;
        result?: unknown;
        error?: { message: string };
      };
      return assertRpcSuccess(response as never).result;
    }
  };
}

export function createHttpMcpAdapter(runtime: CodexRuntimeKind): McpTransportAdapter {
  return createRemoteMcpAdapter(runtime, "streamable-http");
}

export function createSseMcpAdapter(runtime: CodexRuntimeKind): McpTransportAdapter {
  return createRemoteMcpAdapter(runtime, "sse");
}
