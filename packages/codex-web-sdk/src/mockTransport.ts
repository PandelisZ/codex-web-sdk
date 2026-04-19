import type { RawResponsesStreamEvent, ResponsesRequest, ResponsesTransport } from "./types";

type MockHandler = (
  request: ResponsesRequest,
  callIndex: number
) => AsyncIterable<RawResponsesStreamEvent> | Promise<AsyncIterable<RawResponsesStreamEvent>>;

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

async function* fromEvents(events: RawResponsesStreamEvent[]): AsyncGenerator<RawResponsesStreamEvent> {
  for (const event of events) {
    await Promise.resolve();
    yield structuredClone(event);
  }
}

async function* abortableEvents(
  request: ResponsesRequest,
  events: RawResponsesStreamEvent[]
): AsyncGenerator<RawResponsesStreamEvent> {
  for (const event of events) {
    throwIfAborted(request.signal);
    await Promise.resolve();
    throwIfAborted(request.signal);
    yield structuredClone(event);
  }
}

export class MockResponsesTransport implements ResponsesTransport {
  private callIndex = 0;

  constructor(private readonly handler: MockHandler) {}

  async *streamResponse(request: ResponsesRequest): AsyncGenerator<RawResponsesStreamEvent> {
    const stream = await this.handler(request, this.callIndex++);
    yield* stream;
  }
}

export function createDemoMockTransport(): ResponsesTransport {
  return new MockResponsesTransport((request) => {
    const input = request.body.input as Array<Record<string, unknown>>;
    const firstItem = input[0];

    if ("role" in firstItem) {
      return abortableEvents(request, [
        {
          type: "response.output_item.added",
          item: {
            id: "msg_1",
            type: "message",
            content: [],
          }
        },
        {
          type: "response.output_text.delta",
          item_id: "msg_1",
          delta: "I’m checking the forecast first. "
        },
        {
          type: "response.output_item.added",
          item: {
            id: "tool_1",
            type: "function_call",
            call_id: "call_weather_1",
            name: "weather_lookup"
          }
        },
        {
          type: "response.function_call_arguments.delta",
          item_id: "tool_1",
          delta: "{\"city\":\"Limassol\","
        },
        {
          type: "response.function_call_arguments.done",
          item_id: "tool_1",
          arguments: "{\"city\":\"Limassol\",\"day\":\"Saturday\"}"
        },
        {
          type: "response.output_item.done",
          item: {
            id: "tool_1",
            type: "function_call",
            call_id: "call_weather_1",
            name: "weather_lookup",
            arguments: "{\"city\":\"Limassol\",\"day\":\"Saturday\"}"
          }
        },
        {
          type: "response.completed",
          response: {
            id: "resp_demo_1",
            usage: {
              input_tokens: 34,
              output_tokens: 18
            }
          }
        }
      ]);
    }

    return abortableEvents(request, [
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
        delta: "The weather looks sunny at 24C, "
      },
      {
        type: "response.output_text.delta",
        item_id: "msg_2",
        delta: "so a seaside picnic should work well."
      },
      {
        type: "response.output_item.done",
        item: {
          id: "msg_2",
          type: "message",
          content: [
            {
              type: "output_text",
              text: "The weather looks sunny at 24C, so a seaside picnic should work well."
            }
          ]
        }
      },
      {
        type: "response.completed",
        response: {
          id: "resp_demo_2",
          usage: {
            input_tokens: 52,
            input_tokens_details: {
              cached_tokens: 18
            },
            output_tokens: 24
          }
        }
      }
    ]);
  });
}
