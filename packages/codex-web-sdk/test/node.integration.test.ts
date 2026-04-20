// @vitest-environment node

import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MockResponsesTransport } from "../src/index";
import { createNodeRuntimeAdapter } from "../src/node/index";
import type { RawResponsesStreamEvent } from "../src/types";
import { CodexWeb } from "../src/thread";
import { loadTestWasmModule } from "./loadWasm";

async function* fromEvents(events: RawResponsesStreamEvent[]): AsyncGenerator<RawResponsesStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

async function withHttpMcpServer() {
  const calls: Array<Record<string, unknown>> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    calls.push(body);

    let payload: Record<string, unknown>;
    if (body.method === "initialize") {
      payload = { jsonrpc: "2.0", id: body.id, result: {} };
    } else if (body.method === "tools/list") {
      payload = {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "sum_remote",
              inputSchema: {
                type: "object"
              }
            }
          ]
        }
      };
    } else {
      payload = {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          sum: 42
        }
      };
    }

    response.writeHead(200, {
      "Content-Type": "application/json"
    });
    response.end(JSON.stringify(payload));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind port");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

describe("Node MCP runtime adapter", () => {
  it("manages stdio MCP child lifecycle", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "codex-web-sdk-"));
    const lifecycleFile = path.join(tempDir, "stdio-lifecycle.log");
    const adapter = createNodeRuntimeAdapter();
    const registry = adapter.createMcpRegistry({
      servers: [
        {
          id: "stdio_math",
          transport: "stdio",
          command: process.execPath,
          args: [path.resolve("packages/codex-web-sdk/test/fixtures/stdio-mcp-server.mjs")],
          env: {
            STDIO_MCP_LIFECYCLE_FILE: lifecycleFile
          }
        }
      ]
    });

    const tools = await registry.listTools();
    expect(tools[0]?.qualifiedName).toBe("mcp__stdio_math__sum_stdio");
    await registry.dispose();

    const lifecycle = await readFile(lifecycleFile, "utf8");
    expect(lifecycle).toContain("started");
    expect(lifecycle).toContain("exit");
    await rm(tempDir, { recursive: true, force: true });
  });

  it("executes remote MCP transports under the Node adapter", async () => {
    const server = await withHttpMcpServer();
    const adapter = createNodeRuntimeAdapter();
    const registry = adapter.createMcpRegistry({
      servers: [
        {
          id: "remote_math",
          transport: "streamable-http",
          url: server.url
        }
      ]
    });

    const tools = await registry.listTools();
    const result = await registry.asTools(tools)[0].execute(
      {
        a: 20,
        b: 22
      },
      {
        threadId: "thread_node",
        callId: "call_node",
        step: 0,
        signal: new AbortController().signal,
        source: tools[0].source
      }
    );

    expect(result).toEqual({
      sum: 42
    });
    expect(server.calls.some((call) => call.method === "tools/call")).toBe(true);
    await registry.dispose();
    await server.close();
  });

  it("supports mixed local tool and MCP turns", async () => {
    const wasmUrl = await loadTestWasmModule();
    const server = await withHttpMcpServer();
    const transport = new MockResponsesTransport((request, callIndex) => {
      if (callIndex === 0) {
        return fromEvents([
          {
            type: "response.output_item.added",
            item: {
              id: "tool_local",
              type: "function_call",
              call_id: "call_local",
              name: "lookup_local"
            }
          },
          {
            type: "response.function_call_arguments.done",
            item_id: "tool_local",
            arguments: "{}"
          },
          {
            type: "response.output_item.done",
            item: {
              id: "tool_local",
              type: "function_call",
              call_id: "call_local",
              name: "lookup_local",
              arguments: "{}"
            }
          },
          {
            type: "response.completed",
            response: {
              id: "resp_local",
              usage: {
                input_tokens: 1,
                output_tokens: 1
              }
            }
          }
        ]);
      }

      if (callIndex === 1) {
        return fromEvents([
          {
            type: "response.output_item.added",
            item: {
              id: "tool_remote",
              type: "function_call",
              call_id: "call_remote",
              name: "mcp__remote_math__sum_remote"
            }
          },
          {
            type: "response.function_call_arguments.done",
            item_id: "tool_remote",
            arguments: "{}"
          },
          {
            type: "response.output_item.done",
            item: {
              id: "tool_remote",
              type: "function_call",
              call_id: "call_remote",
              name: "mcp__remote_math__sum_remote",
              arguments: "{}"
            }
          },
          {
            type: "response.completed",
            response: {
              id: "resp_remote",
              usage: {
                input_tokens: 1,
                output_tokens: 1
              }
            }
          }
        ]);
      }

      return fromEvents([
        {
          type: "response.output_item.added",
          item: {
            id: "msg_done",
            type: "message",
            content: []
          }
        },
        {
          type: "response.output_text.delta",
          item_id: "msg_done",
          delta: "mixed"
        },
        {
          type: "response.output_item.done",
          item: {
            id: "msg_done",
            type: "message",
            content: [
              {
                type: "output_text",
                text: "mixed"
              }
            ]
          }
        },
        {
          type: "response.completed",
          response: {
            id: `resp_${callIndex}`,
            usage: {
              input_tokens: 1,
              output_tokens: 1
            }
          }
        }
      ]);
    });

    const thread = new CodexWeb({
      transport,
      wasmUrl,
      runtimeAdapter: createNodeRuntimeAdapter()
    }).startThread({
      tools: [
        {
          name: "lookup_local",
          execute: async () => ({
            value: "local"
          })
        }
      ],
      mcpServers: [
        {
          id: "remote_math",
          transport: "streamable-http",
          url: server.url
        }
      ]
    });

    const result = await thread.run("mix");
    expect(result.finalResponse).toBe("mixed");
    await server.close();
  });
});
