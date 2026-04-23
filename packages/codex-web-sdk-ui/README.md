# `@pandelis/codex-web-sdk-ui`

Composable UI primitives for `@pandelis/codex-web-sdk-react`.

## Components

- `ChatRoot`
- `ChatTranscript`
- `ChatMessageList`
- `ChatComposer`
- `ChatStatus`
- `ModelSelector`
- `ReasoningSelector`
- `ToolEditor`
- `McpServerList`
- `EventInspector`

## Example

```tsx
import { ChatComposer, ChatRoot, ChatTranscript } from "@pandelis/codex-web-sdk-ui";

function Surface({ chat }) {
  return (
    <ChatRoot chat={chat}>
      <ChatTranscript />
      <ChatComposer />
    </ChatRoot>
  );
}
```

See the workspace root `README.md` for the full SDK walkthrough.
