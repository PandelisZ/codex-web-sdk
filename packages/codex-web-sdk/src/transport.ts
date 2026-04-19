import type { AgentOptions, RawResponsesStreamEvent, ResponsesRequest, ResponsesTransport } from "./types";

async function* parseSseStream(response: Response): AsyncGenerator<RawResponsesStreamEvent> {
  if (!response.body) {
    throw new Error("streaming response did not include a body");
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

      const lines = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());
      if (lines.length === 0) {
        continue;
      }

      const payload = lines.join("\n");
      if (payload === "[DONE]") {
        return;
      }

      yield JSON.parse(payload) as RawResponsesStreamEvent;
    }

    if (done) {
      break;
    }
  }
}

export class FetchResponsesTransport implements ResponsesTransport {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly headers?: HeadersInit;
  private readonly fetchImpl: typeof fetch;

  constructor(options: Pick<AgentOptions, "apiKey" | "baseUrl" | "headers" | "fetch">) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.headers = options.headers;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *streamResponse(request: ResponsesRequest): AsyncGenerator<RawResponsesStreamEvent> {
    const endpoint = this.baseUrl.endsWith("/responses")
      ? this.baseUrl
      : `${this.baseUrl.replace(/\/$/, "")}/responses`;
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        ...(this.headers ?? {}),
      },
      body: JSON.stringify(request.body),
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    yield* parseSseStream(response);
  }
}

export function createFetchTransport(
  options: Pick<AgentOptions, "apiKey" | "baseUrl" | "headers" | "fetch">
): ResponsesTransport {
  return new FetchResponsesTransport(options);
}
