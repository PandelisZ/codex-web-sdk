import type { AgentOptions, ResponsesTransport, ThreadOptions } from "../../../packages/codex-web-sdk/src/index";
import type { ThreadEvent } from "../../../packages/codex-web-sdk/src/index";
import { useCodexAgent } from "../../../packages/codex-web-sdk/src/react";

const DEFAULT_PROMPT = "Reply with exactly: PANDELIS_CODEX_WEB_OK";

type RuntimeConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  initialInput?: string;
};

declare global {
  interface Window {
    __PANDELIS_CODEX_WEB_CONFIG__?: RuntimeConfig;
  }
}

function getEventLabel(event: ThreadEvent): string {
  switch (event.type) {
    case "thread.started":
      return `thread started: ${event.threadId}`;
    case "turn.started":
      return "turn started";
    case "text.delta":
      return `delta: ${event.delta}`;
    case "item.started":
    case "item.updated":
    case "item.completed":
      return `${event.type}: ${event.item.type}`;
    case "turn.completed":
      return `turn completed: ${event.usage.outputTokens} output tokens`;
    case "turn.failed":
      return `turn failed: ${event.error.message}`;
    case "error":
      return `error: ${event.message}`;
  }
}

type AppProps = {
  wasmUrl?: AgentOptions["wasmUrl"];
  transport?: ResponsesTransport;
  initialInput?: string;
  agentOptions?: Partial<AgentOptions>;
  threadOptions?: ThreadOptions;
};

function defaultThreadOptions(): ThreadOptions {
  return {
    tools: []
  };
}

function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") {
    return {};
  }

  return window.__PANDELIS_CODEX_WEB_CONFIG__ ?? {};
}

export function App({ wasmUrl, transport, initialInput, agentOptions, threadOptions }: AppProps = {}): JSX.Element {
  const runtimeConfig = getRuntimeConfig();
  const resolvedInput = initialInput ?? runtimeConfig.initialInput ?? DEFAULT_PROMPT;
  const hasConfiguredTransport =
    Boolean(transport) ||
    Boolean(agentOptions?.transport) ||
    Boolean(runtimeConfig.baseUrl) ||
    Boolean(runtimeConfig.apiKey) ||
    Boolean(agentOptions?.baseUrl) ||
    Boolean(agentOptions?.apiKey);
  const {
    input: prompt,
    setInput: setPrompt,
    messages,
    events,
    status,
    submit
  } = useCodexAgent({
    agentOptions: {
      apiKey: runtimeConfig.apiKey,
      baseUrl: runtimeConfig.baseUrl,
      model: runtimeConfig.model,
      transport,
      wasmUrl,
      ...agentOptions
    },
    threadOptions: threadOptions ?? defaultThreadOptions(),
    initialInput: resolvedInput
  });

  const assistantText =
    [...messages]
      .reverse()
      .find((message) => message.role === "assistant")
      ?.content ?? "";

  return (
    <main className="page">
      <section className="panel">
        <header className="header">
          <p className="eyebrow">@pandelis/codex-web-sdk</p>
          <h1>@pandelis/codex-web-sdk demo</h1>
          <p className="lede">
            This page runs the WebAssembly runtime in the browser and streams from a live Responses-compatible endpoint.
          </p>
          {!hasConfiguredTransport ? (
            <p className="lede">
              Provide <code>window.__PANDELIS_CODEX_WEB_CONFIG__ = {"{ baseUrl }"}</code> before loading the page,
              or pass <code>agentOptions</code> / <code>transport</code> as props when embedding the component.
            </p>
          ) : null}
        </header>

        <label className="composer" htmlFor="prompt">
          <span>Prompt</span>
          <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />
        </label>

        <button className="runButton" disabled={!hasConfiguredTransport || status === "submitted" || status === "streaming"} onClick={() => void submit()} type="button">
          {status === "submitted" || status === "streaming" ? "Streaming..." : "Run Turn"}
        </button>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Assistant Output</h2>
          <pre data-testid="assistant-output">{assistantText || "Waiting for output..."}</pre>
        </article>

        <article className="card">
          <h2>Event Log</h2>
          <ol data-testid="event-log">
            {events.map((event, index) => (
              <li key={`${index}-${event.type}`}>{getEventLabel(event)}</li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}
