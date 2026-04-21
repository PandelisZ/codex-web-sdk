import type { CodexOptions, RawResponsesStreamEvent, ResponsesRequest, ResponsesTransport } from "../types";

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
      const chunk = buffer.trim();
      if (chunk) {
        const lines = chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());
        const payload = lines.join("\n");
        if (payload && payload !== "[DONE]") {
          yield JSON.parse(payload) as RawResponsesStreamEvent;
        }
      }
      break;
    }
  }
}

export class FetchResponsesTransport implements ResponsesTransport {
  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly defaultHeaders?: HeadersInit;
  private readonly fetchImpl: typeof fetch;

  constructor(options: Pick<CodexOptions, "apiKey" | "baseURL" | "defaultHeaders" | "fetch">) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL ?? "https://api.openai.com/v1";
    this.defaultHeaders = options.defaultHeaders;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async *streamResponse(request: ResponsesRequest): AsyncGenerator<RawResponsesStreamEvent> {
    const endpoint = this.baseURL.endsWith("/responses")
      ? this.baseURL
      : `${this.baseURL.replace(/\/$/, "")}/responses`;
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        ...(this.defaultHeaders ?? {})
      },
      body: JSON.stringify(request.body),
      signal: request.signal
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    yield* parseSseStream(response);
  }
}

export function createFetchTransport(
  options: Pick<CodexOptions, "apiKey" | "baseURL" | "defaultHeaders" | "fetch">
): ResponsesTransport {
  return new FetchResponsesTransport(options);
}
