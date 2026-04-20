# @pandelis/codex-web-sdk

Browser-oriented SDK for running a Codex-style multi-turn agent with a Rust/WASM runtime, a TypeScript wrapper, and a real browser demo wired to the live Responses API.

## Workspace layout

- `vendor/openai-codex`: vendored upstream `openai/codex` source.
- `xtask/codex-web-sdk-xtask`: native helper that compiles against upstream Codex crates and exports protocol types.
- `crates/codex-web-sdk-wasm`: browser-safe runtime state machine compiled to WebAssembly.
- `packages/codex-web-sdk`: TypeScript SDK around the WASM runtime, published as `@pandelis/codex-web-sdk`.
- `apps/demo`: Vite/React demo wired to either a live transport or a test-only mock transport.

## Commands

```bash
pnpm install
cargo install wasm-bindgen-cli --version 0.2.118
pnpm playwright:install

pnpm build
pnpm test
pnpm test:e2e
pnpm dev
```

`pnpm build` and `pnpm test` can run concurrently. The upstream protocol export and copy steps are guarded by an xtask file lock so one process does not read partially regenerated artifacts from another.

## React Hook

For AI SDK-style UI state, import the React subpath and use `useCodexAgent`:

```ts
import { useCodexAgent } from "@pandelis/codex-web-sdk/react";

const agent = useCodexAgent({
  agentOptions: {
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY
  },
  threadOptions: {
    tools: [
      {
        name: "lookup_weather",
        execute: async (input) => {
          return { ok: true, input };
        }
      }
    ]
  },
  initialInput: "Plan a Saturday picnic in Limassol."
});
```

The hook tracks `messages`, `status`, `events`, `usage`, `submit()`, `stop()`, and `reset()` while reusing the same multi-turn thread under the hood.

## Live Browser E2E

`pnpm test:e2e` runs the built demo in Chromium against the real Responses API.

- It requires `OPENAI_API_KEY` in the shell environment.
- The browser never receives the raw key directly.
- The E2E runner starts a local proxy that forwards `/v1/responses` to OpenAI with streaming preserved and CORS enabled for the demo page.

## Static GitHub Pages Demo

The demo is a static Vite app and can be hosted on GitHub Pages without a backend. In that mode:

- the page is served from `apps/demo/dist`
- asset URLs are rebased automatically for the repository path
- API requests go directly from the browser to OpenAI unless the user overrides `Base URL`
- the hosted demo user must paste an API key into the settings panel

This repo includes `.github/workflows/gh-pages.yml`, which builds the workspace and deploys the demo on pushes to `main` or via manual dispatch.

For a local check of the project-page path, replace `codex-web-sdk` with your repository name:

```bash
VITE_PUBLIC_BASE=/codex-web-sdk/ pnpm build
pnpm --filter codex-web-sdk-demo exec vite preview --host 127.0.0.1 --port 4173
```

## Upstream WASM Boundary

The repo vendors the real `openai/codex` Rust workspace and reuses its protocol artifacts, but the native `codex-core` runtime does not currently compile to `wasm32-unknown-unknown` because its dependency graph still includes native Tokio/Mio networking and OS/process facilities. The WebAssembly runtime in this repo is the browser-safe runtime layer tested against the real API.

## Scope

This repo does not try to force the full native Codex CLI into the browser. Instead it reuses vendored upstream Codex protocol artifacts and exposes a browser-specific runtime that supports:

- multi-turn threads
- streamed text updates
- function tool calls
- tool-result turn continuation
- browser/demo verification against a mock transport

`pnpm test:e2e` launches the built demo in a local preview server, drives Chromium, verifies the streamed UI, and writes a screenshot to `output/playwright/demo-e2e.png`.
