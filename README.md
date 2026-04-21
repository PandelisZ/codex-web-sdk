# `@pandelis/codex-web-sdk`

Embed a Codex-style threaded agent in a browser app with an API shape closer to the OpenAI SDK family.

This workspace ships three layers:

- `@pandelis/codex-web-sdk`: core client, threads resource, tools, MCP support
- `@pandelis/codex-web-sdk-react`: provider and hooks for chat/thread state
- `@pandelis/codex-web-sdk-ui`: composable chat and inspector primitives

## Install

```bash
npm install @pandelis/codex-web-sdk
```

```bash
npm install @pandelis/codex-web-sdk @pandelis/codex-web-sdk-react
```

```bash
npm install @pandelis/codex-web-sdk @pandelis/codex-web-sdk-react @pandelis/codex-web-sdk-ui
```

You need access to the OpenAI Responses API.

For quick browser prototypes, pass an `apiKey` directly.

For production apps, point `baseURL` at your own backend or proxy instead of shipping a permanent API key to the client.

## Quick Start

```ts
import Codex, { toTool } from "@pandelis/codex-web-sdk";

const client = new Codex({
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: "gpt-5"
});

const thread = client.threads.create({
  instructions: "You are a senior coding assistant. Be concise and practical.",
  tools: [
    toTool<{ city: string }>({
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

Stream intermediate events with `runStreamed()`:

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

```tsx
import Codex from "@pandelis/codex-web-sdk";
import { CodexProvider, useCodexAgent } from "@pandelis/codex-web-sdk-react";

const client = new Codex({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  defaultModel: "gpt-5"
});

function Chat() {
  const agent = useCodexAgent({
    client,
    threadOptions: {
      instructions: "You are helping the user build software.",
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
    <CodexProvider options={{ apiKey: import.meta.env.VITE_OPENAI_API_KEY }}>
      <Chat />
    </CodexProvider>
  );
}
```

`useCodexAgent()` is the quickest starting point.

The React package also exposes:

- `useCodexThread()` for thread lifecycle and snapshots
- `useCodexChat()` for chat state and actions
- `CodexProvider` for shared client defaults and persistence

## UI Package

`@pandelis/codex-web-sdk-ui` exports composable primitives:

- `ChatTranscript`
- `ChatComposer`
- `ChatStatus`
- `SettingsPanel`
- `ModelSelector`
- `ReasoningSelector`
- `ToolEditor`
- `McpServerList`
- `EventInspector`

## MCP And Tools

Attach local tools with `tools`, or wire in MCP servers with `mcpServers`.

Supported MCP transport descriptors include:

- `streamable-http`
- `sse`
- `websocket`
- `stdio`

## Package Structure

Core entrypoints:

- `@pandelis/codex-web-sdk`: `Codex`, `toTool`, shared public types
- `@pandelis/codex-web-sdk/threads`: thread resource classes and types
- `@pandelis/codex-web-sdk/mcp`: MCP registry exports
- `@pandelis/codex-web-sdk/node`: Node runtime adapter helpers

## Local Development

```bash
pnpm install
cargo install wasm-bindgen-cli --version 0.2.118
pnpm playwright:install
```

Then run:

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
