import { describe, expect, it } from "vitest";

import { CodexWeb, MockResponsesTransport } from "../src/index";
import type { RawResponsesStreamEvent, ResponsesRequest } from "../src/types";
import { loadTestWasmModule } from "./loadWasm";

async function* fromEvents(events: RawResponsesStreamEvent[]): AsyncGenerator<RawResponsesStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

describe("CodexWeb", () => {
  it("streams tool calls and final text through a multi-step turn", async () => {
    const wasmUrl = await loadTestWasmModule();
    const requests: ResponsesRequest[] = [];
    const transport = new MockResponsesTransport((request, callIndex) => {
      requests.push(request);
      if (callIndex === 0) {
        return fromEvents([
          {
            type: "response.output_item.added",
            item: {
              id: "tool_1",
              type: "function_call",
              call_id: "call_1",
              name: "lookup"
            }
          },
          {
            type: "response.function_call_arguments.done",
            item_id: "tool_1",
            arguments: "{\"topic\":\"sdk\"}"
          },
          {
            type: "response.output_item.done",
            item: {
              id: "tool_1",
              type: "function_call",
              call_id: "call_1",
              name: "lookup",
              arguments: "{\"topic\":\"sdk\"}"
            }
          },
          {
            type: "response.completed",
            response: {
              id: "resp_1",
              usage: {
                input_tokens: 10,
                output_tokens: 4
              }
            }
          }
        ]);
      }

      return fromEvents([
        {
          type: "response.output_item.added",
          item: {
            id: "msg_2",
            type: "message",
            content: []
          }
        },
        {
          type: "response.output_text.delta",
          item_id: "msg_2",
          delta: "Here is the "
        },
        {
          type: "response.output_text.delta",
          item_id: "msg_2",
          delta: "result."
        },
        {
          type: "response.output_item.done",
          item: {
            id: "msg_2",
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Here is the result."
              }
            ]
          }
        },
        {
          type: "response.completed",
          response: {
            id: "resp_2",
            usage: {
              input_tokens: 12,
              input_tokens_details: {
                cached_tokens: 3
              },
              output_tokens: 6
            }
          }
        }
      ]);
    });

    const agent = new CodexWeb({
      transport,
      wasmUrl
    });
    const thread = agent.startThread({
      tools: [
        {
          name: "lookup",
          execute: async () => ({
            answer: "ok"
          })
        }
      ]
    });

    const result = await thread.run("Use the tool");

    expect(result.finalResponse).toBe("Here is the result.");
    expect(result.usage).toEqual({
      inputTokens: 12,
      cachedInputTokens: 3,
      outputTokens: 6
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].body.previous_response_id).toBe("resp_1");
  });

  it("closes the stream cleanly when aborted", async () => {
    const wasmUrl = await loadTestWasmModule();
    const transport = new MockResponsesTransport(async function* (request) {
      yield {
        type: "response.output_item.added",
        item: {
          id: "msg_abort",
          type: "message",
          content: []
        }
      };
      yield {
        type: "response.output_text.delta",
        item_id: "msg_abort",
        delta: "partial"
      };

      await new Promise((resolve, reject) => {
        request.signal?.addEventListener(
          "abort",
          () => {
            reject(createAbortError());
          },
          { once: true }
        );
        setTimeout(resolve, 10_000);
      });
    });

    const agent = new CodexWeb({
      transport,
      wasmUrl
    });
    const thread = agent.startThread();
    const controller = new AbortController();
    const { events } = await thread.runStreamed("Abort me", {
      signal: controller.signal
    });

    const seen: string[] = [];
    for await (const event of events) {
      seen.push(event.type);
      if (event.type === "text.delta") {
        controller.abort();
      }
    }

    expect(seen).toContain("text.delta");
    expect(seen).not.toContain("error");
    expect(seen).not.toContain("turn.failed");
  });
});
