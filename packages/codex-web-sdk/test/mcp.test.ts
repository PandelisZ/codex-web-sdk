import { describe, expect, it } from "vitest";

import Codex, { MockResponsesTransport, createMcpRegistry } from "../src/index";
import type {
  CreateMcpRegistryOptions,
  McpServerDescriptor,
  McpToolDescriptor,
  McpTransportAdapter,
  RawResponsesStreamEvent,
  ResponsesRequest
} from "../src/types";
import { loadTestWasmModule } from "./loadWasm";

async function* fromEvents(events: RawResponsesStreamEvent[]): AsyncGenerator<RawResponsesStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

describe("MCP registry integration", () => {
  it("replaces model and reasoning config between turns", async () => {
    const wasmURL = await loadTestWasmModule();
    const requests: ResponsesRequest[] = [];
    const transport = new MockResponsesTransport((request) => {
      requests.push(structuredClone(request));
      return fromEvents([
        {
          type: "response.output_item.added",
          item: {
            id: "msg_1",
            type: "message",
            content: []
          }
        },
        {
          type: "response.output_text.delta",
          item_id: "msg_1",
          delta: "ok"
        },
        {
          type: "response.output_item.done",
          item: {
            id: "msg_1",
            type: "message",
            content: [
              {
                type: "output_text",
                text: "ok"
              }
            ]
          }
        },
        {
          type: "response.completed",
          response: {
            id: `resp_${requests.length}`,
            usage: {
              input_tokens: 1,
              output_tokens: 1
            }
          }
        }
      ]);
    });

    const thread = new Codex({
      transport,
      wasmURL,
      defaultModel: "gpt-5.1-codex",
      defaultReasoning: {
        effort: "low",
        summary: "none"
      }
    }).threads.create();

    await thread.run("first");
    thread.update({
      model: "gpt-5.4",
      reasoning: {
        effort: "high",
        summary: "auto"
      }
    });
    await thread.run("second");

    expect(requests[0].body.model).toBe("gpt-5.1-codex");
    expect(requests[0].body.reasoning).toEqual({
      effort: "low",
      summary: "none"
    });
    expect(requests[1].body.model).toBe("gpt-5.4");
    expect(requests[1].body.reasoning).toEqual({
      effort: "high",
      summary: "auto"
    });
  });

  it("replaces tool and MCP descriptors between runs", async () => {
    const wasmURL = await loadTestWasmModule();
    const adapterCalls: string[] = [];
    const adapter: McpTransportAdapter = {
      runtime: "browser",
      transport: "streamable-http",
      async listTools(server) {
        return [
          {
            id: `${server.id}:lookup_remote`,
            serverId: server.id,
            serverName: server.name ?? server.id,
            name: "lookup_remote",
            qualifiedName: `mcp__${server.id}__lookup_remote`,
            inputSchema: {
              type: "object"
            },
            source: {
              kind: "mcp",
              serverId: server.id,
              serverName: server.name ?? server.id,
              toolName: "lookup_remote"
            }
          }
        ];
      },
      async callTool({ server }) {
        adapterCalls.push(server.id);
        return {
          via: server.id
        };
      }
    };
    const runtimeAdapter = {
      runtime: "browser" as const,
      createResponsesTransport(config: { transport?: ResponsesRequest["signal"] }) {
        return config.transport as never;
      },
      createMcpRegistry(config: Omit<CreateMcpRegistryOptions, "runtime" | "adapters">) {
        return createMcpRegistry({
          ...config,
          runtime: "browser",
          adapters: [adapter]
        });
      },
      supportsMcpTransport() {
        return true;
      }
    };
    const transport = new MockResponsesTransport((request, callIndex) => {
      if (callIndex === 0 || callIndex === 2) {
        const toolName = callIndex === 0 ? "lookup_local" : "lookup_replaced";
        return fromEvents([
          {
            type: "response.output_item.added",
            item: {
              id: `tool_${callIndex}`,
              type: "function_call",
              call_id: `call_${callIndex}`,
              name: toolName
            }
          },
          {
            type: "response.function_call_arguments.done",
            item_id: `tool_${callIndex}`,
            arguments: "{}"
          },
          {
            type: "response.output_item.done",
            item: {
              id: `tool_${callIndex}`,
              type: "function_call",
              call_id: `call_${callIndex}`,
              name: toolName,
              arguments: "{}"
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
      }

      if (callIndex === 4 || callIndex === 6) {
        const remoteName = callIndex === 4 ? "mcp__server_one__lookup_remote" : "mcp__server_two__lookup_remote";
        return fromEvents([
          {
            type: "response.output_item.added",
            item: {
              id: `tool_${callIndex}`,
              type: "function_call",
              call_id: `call_${callIndex}`,
              name: remoteName
            }
          },
          {
            type: "response.function_call_arguments.done",
            item_id: `tool_${callIndex}`,
            arguments: "{}"
          },
          {
            type: "response.output_item.done",
            item: {
              id: `tool_${callIndex}`,
              type: "function_call",
              call_id: `call_${callIndex}`,
              name: remoteName,
              arguments: "{}"
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
      }

      return fromEvents([
        {
          type: "response.output_item.added",
          item: {
            id: `msg_${callIndex}`,
            type: "message",
            content: []
          }
        },
        {
          type: "response.output_text.delta",
          item_id: `msg_${callIndex}`,
          delta: "done"
        },
        {
          type: "response.output_item.done",
          item: {
            id: `msg_${callIndex}`,
            type: "message",
            content: [
              {
                type: "output_text",
                text: "done"
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

    const thread = new Codex({
      transport,
      wasmURL,
      runtimeAdapter
    }).threads.create({
      tools: [
        {
          name: "lookup_local",
          execute: async () => ({
            value: "local-one"
          })
        }
      ]
    });

    await thread.run("local one");
    thread.update({
      tools: [
        {
          name: "lookup_replaced",
          execute: async () => ({
            value: "local-two"
          })
        }
      ]
    });
    await thread.run("local two");

    thread.update({
      tools: [],
      mcpServers: [
        {
          id: "server_one",
          transport: "streamable-http",
          url: "https://example.com/server-one"
        }
      ]
    });
    await thread.run("remote one");
    thread.update({
      mcpServers: [
        {
          id: "server_two",
          transport: "streamable-http",
          url: "https://example.com/server-two"
        }
      ]
    });
    await thread.run("remote two");

    expect(adapterCalls).toEqual(["server_one", "server_two"]);
  });
});
