# `@pandelis/codex-web-sdk-react`

React hooks and provider for `@pandelis/codex-web-sdk`.

## Surface

- `CodexProvider`
- `useCodexThread`
- `useCodexChat`
- `useCodexAgent`

## Example

```tsx
import Codex from "@pandelis/codex-web-sdk";
import { CodexProvider, useCodexAgent } from "@pandelis/codex-web-sdk-react";

const client = new Codex({ apiKey: import.meta.env.VITE_OPENAI_API_KEY });

function Chat() {
  const agent = useCodexAgent({
    client,
    threadOptions: {
      instructions: "Help with software tasks."
    }
  });

  return <button onClick={() => agent.submit("Say hello")}>Run</button>;
}

export function App() {
  return (
    <CodexProvider options={{ apiKey: import.meta.env.VITE_OPENAI_API_KEY }}>
      <Chat />
    </CodexProvider>
  );
}
```

See the workspace root `README.md` for the full integration guide.
