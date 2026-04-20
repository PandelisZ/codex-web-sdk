# `@pandelis/codex-web-sdk`

Ever thought, "Gosh i wish i could just use the Codex harness in my chat app instead of needing to re-engineer an entire agentic loop from scratch for the 5th time"

Well now you can.

This repo packages a browser-friendly Codex runtime, a React wrapper, and some UI building blocks so you can drop a real multi-turn agent into your app without rebuilding:

- streamed assistant output
- multi-turn thread state
- function tool calls
- MCP server integration
- React hooks for chat/agent flows
- optional prebuilt UI primitives

## Install

Pick the layer you want:

```bash
npm install @pandelis/codex-web-sdk
```

```bash
npm install @pandelis/codex-web-sdk @pandelis/codex-web-sdk-react
```

```bash
npm install @pandelis/codex-web-sdk @pandelis/codex-web-sdk-react @pandelis/codex-web-sdk-ui
```

You will need access to the OpenAI Responses API.

For quick prototypes you can pass an `apiKey` directly.

For production browser apps, point `baseUrl` at your own backend or proxy instead of shipping a permanent API key to the client.

## Quick Start

If you just want a Codex-style thread in plain TypeScript:

```ts
import { createCodexClient, createTool } from "@pandelis/codex-web-sdk";

const client = createCodexClient({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-5"
});

const thread = client.startThread({
  systemPrompt: "You are a senior coding assistant. Be concise and practical.",
  tools: [
    createTool<{ city: string }>({
      name: "lookup_weather",
      description: "Look up the current weather for a city.",
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string" }
        },
        required: ["city"]
      },
      async execute(input) {
        return {
          city: input.city,
          forecast: "Sunny",
          temperatureC: 27
        };
      }
    })
  ]
});

const result = await thread.run("Plan a half-day trip in Limassol for tomorrow.");

console.log(result.finalResponse);
console.log(result.usage);
```

If you want to stream events instead:

```ts
const { events } = await thread.runStreamed("Help me debug this TypeScript error.");
let text = "";

for await (const event of events) {
  if (event.type === "text.delta") {
    text += event.delta;
  }
}

console.log(text);
```

## React

If your app is already React-based, use the hooks package and let it manage the thread lifecycle for you:

```tsx
import { CodexProvider, useCodexAgent } from "@pandelis/codex-web-sdk-react";

function Chat() {
  const agent = useCodexAgent({
    config: {
      model: "gpt-5",
      systemPrompt: "You are helping the user build software.",
      tools: [
        {
          name: "lookup_weather",
          async execute(input) {
            return { ok: true, input };
          }
        }
      ]
    },
    initialInput: "Build me a launch checklist for this repo."
  });

  return (
    <div>
      <button onClick={() => agent.submit()}>Run</button>
      <pre>{agent.messages.map((message) => message.content).join("\n\n")}</pre>
    </div>
  );
}

export default function App() {
  return (
    <CodexProvider
      config={{
        apiKey: import.meta.env.VITE_OPENAI_API_KEY
      }}
    >
      <Chat />
    </CodexProvider>
  );
}
```

`useCodexAgent()` is the easiest starting point.

If you want more control, the React package also exposes:

- `useCodexThread()` for low-level thread state
- `useCodexChat()` for chat-oriented state and actions
- `CodexProvider` for sharing a client and persistence adapter

## UI Package

If you do not want to build the whole chat surface yourself, the UI package exports ready-made pieces:

- `ChatTranscript`
- `ChatComposer`
- `ChatStatus`
- `SettingsPanel`
- `ModelSelector`
- `ReasoningSelector`
- `ToolEditor`
- `McpServerList`
- `EventInspector`

These are meant to be composed into your own product UI, not force you into one rigid shell.

## MCP And Tools

You can attach local tools with `tools`, or wire in MCP servers with `mcpServers`.

Supported MCP transport descriptors include:

- `streamable-http`
- `sse`
- `websocket`
- `stdio`

That means you can start simple with local functions, then grow into MCP-backed capabilities without changing the rest of your app architecture.

## Local Development

If you are working in this repo itself:

```bash
pnpm install
cargo install wasm-bindgen-cli --version 0.2.118
pnpm playwright:install
```

Then use:

```bash
pnpm build
pnpm test
pnpm test:e2e
pnpm dev
```

Workspace layout:

- `packages/codex-web-sdk`: core TypeScript SDK
- `packages/codex-web-sdk-react`: React hooks and provider
- `packages/codex-web-sdk-ui`: composable UI components
- `apps/demo`: demo app
- `crates/codex-web-sdk-wasm`: browser-safe WASM runtime
- `xtask/codex-web-sdk-xtask`: upstream protocol export helpers

## What This Is

This is not "the full Codex CLI stuffed into a browser tab".

It is the useful part you actually want in product code:

- the agent loop
- the thread state
- the streaming events
- the tool calling
- the browser-safe runtime layer

If your goal is "put a Codex-style agent inside my app", this is the part you can use directly.
