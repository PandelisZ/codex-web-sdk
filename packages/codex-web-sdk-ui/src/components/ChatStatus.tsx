import type { JSX } from "react";

import { useChatContext } from "../context";

function getStatusLabel(status: string): string {
  switch (status) {
    case "idle":
      return "Ready to chat";
    case "submitted":
      return "Submitting";
    case "streaming":
      return "Streaming response";
    case "ready":
      return "Turn complete";
    case "error":
      return "Something failed";
    default:
      return status;
  }
}

export function ChatStatus({ className }: { className?: string }): JSX.Element {
  const chat = useChatContext();

  return (
    <div className={className} data-codex-chat-status="" data-status={chat.status}>
      <span>{getStatusLabel(chat.status)}</span>
      {chat.usage ? (
        <span>
          {chat.usage.outputTokens} output tokens
        </span>
      ) : null}
      {chat.error ? <span>{chat.error.message}</span> : null}
    </div>
  );
}
