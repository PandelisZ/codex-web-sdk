# `@pandelis/codex-web-sdk`

Thread-first Codex SDK for browser and app integrations.

## Quick Start

```ts
import Codex, { toTool } from "@pandelis/codex-web-sdk";

const client = new Codex({
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: "gpt-5.4"
});

const thread = client.threads.create({
  instructions: "Be concise and practical.",
  tools: [
    toTool({
      name: "ping",
      async execute() {
        return { ok: true };
      }
    })
  ]
});

const result = await thread.run("Say hello.");
```

## Exports

- `@pandelis/codex-web-sdk`: `Codex`, `toTool`, shared public types
- `@pandelis/codex-web-sdk/threads`: thread resource classes and types
- `@pandelis/codex-web-sdk/mcp`: MCP registry exports
- `@pandelis/codex-web-sdk/node`: Node runtime adapter helpers

See the workspace root `README.md` for the full React/UI examples.
