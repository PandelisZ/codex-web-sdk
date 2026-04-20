import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { assertRpcSuccess, createRpcRequest, toMcpInitializeParams } from "../mcp/rpc";
import type {
  McpServerDescriptor,
  McpToolDescriptor,
  McpTransportAdapter,
  StdioMcpServerDescriptor
} from "../types";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type Session = {
  child: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingRequest>;
  initialized: boolean;
  buffer: string;
};

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

export class NodeStdioMcpAdapter implements McpTransportAdapter {
  readonly runtime = "node" as const;
  readonly transport = "stdio" as const;
  private readonly sessions = new Map<string, Session>();

  private ensureSession(server: StdioMcpServerDescriptor): Session {
    const existing = this.sessions.get(server.id);
    if (existing) {
      return existing;
    }

    const child = spawn(server.command, server.args ?? [], {
      cwd: server.cwd,
      env: {
        ...process.env,
        ...(server.env ?? {})
      },
      stdio: "pipe"
    });

    const session: Session = {
      child,
      pending: new Map(),
      initialized: false,
      buffer: ""
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      session.buffer += chunk;
      let boundary = session.buffer.indexOf("\n");
      while (boundary >= 0) {
        const line = session.buffer.slice(0, boundary).trim();
        session.buffer = session.buffer.slice(boundary + 1);
        boundary = session.buffer.indexOf("\n");
        if (!line) {
          continue;
        }

        try {
          const message = JSON.parse(line) as { id?: number; error?: { message: string } };
          if (typeof message.id !== "number") {
            continue;
          }

          const pending = session.pending.get(message.id);
          if (!pending) {
            continue;
          }

          session.pending.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message);
          }
        } catch (error) {
          for (const pending of session.pending.values()) {
            pending.reject(error instanceof Error ? error : new Error(String(error)));
          }
          session.pending.clear();
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", () => {
      // MCP fixtures can write logs on stderr without breaking the session.
    });

    child.on("exit", () => {
      for (const pending of session.pending.values()) {
        pending.reject(new Error(`stdio MCP process exited for ${server.id}`));
      }
      session.pending.clear();
      this.sessions.delete(server.id);
    });

    this.sessions.set(server.id, session);
    return session;
  }

  private async call(
    server: StdioMcpServerDescriptor,
    body: { id: number; jsonrpc: "2.0"; method: string; params?: unknown }
  ): Promise<unknown> {
    const session = this.ensureSession(server);
    return await new Promise((resolve, reject) => {
      session.pending.set(body.id, {
        resolve,
        reject
      });
      session.child.stdin.write(`${JSON.stringify(body)}\n`);
    });
  }

  private async initialize(server: StdioMcpServerDescriptor): Promise<void> {
    const session = this.ensureSession(server);
    if (session.initialized) {
      return;
    }

    const response = (await this.call(server, createRpcRequest("initialize", toMcpInitializeParams()))) as never;
    assertRpcSuccess(response);
    session.initialized = true;
  }

  async listTools(server: McpServerDescriptor): Promise<McpToolDescriptor[]> {
    if (server.transport !== "stdio") {
      return [];
    }

    await this.initialize(server);
    const response = (await this.call(server, createRpcRequest("tools/list"))) as never;
    return normalizeTools(server, assertRpcSuccess(response).result);
  }

  async callTool({
    server,
    tool,
    input
  }: {
    server: McpServerDescriptor;
    tool: McpToolDescriptor;
    input: unknown;
  }): Promise<unknown> {
    if (server.transport !== "stdio") {
      throw new Error(`Adapter stdio cannot handle ${server.transport}`);
    }

    await this.initialize(server);
    const response = (await this.call(
      server,
      createRpcRequest("tools/call", {
        name: tool.name,
        arguments: (input ?? {}) as never
      })
    )) as never;
    return assertRpcSuccess(response).result;
  }

  async dispose(): Promise<void> {
    await Promise.all(
      Array.from(this.sessions.values()).map(
        async (session) =>
          await new Promise<void>((resolve) => {
            session.child.once("exit", () => resolve());
            session.child.kill("SIGTERM");
          })
      )
    );
  }
}
