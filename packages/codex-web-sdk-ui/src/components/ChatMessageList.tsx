import type { JSX } from "react";

import type { CodexChatMessage } from "@pandelis/codex-web-sdk-react";

import { useChatContext } from "../context";

export function ChatMessageList({
  className,
  messages,
  renderMessage
}: {
  className?: string;
  messages?: CodexChatMessage[];
  renderMessage?: (message: CodexChatMessage) => React.ReactNode;
}): JSX.Element {
  const chat = useChatContext();
  const list = messages ?? chat.messages;

  return (
    <ol className={className} data-codex-message-list="">
      {list.map((message) => (
        <li key={message.id} data-role={message.role} data-status={message.status}>
          {renderMessage ? (
            renderMessage(message)
          ) : (
            <article data-codex-message="">
              <header>{message.role}</header>
              <pre>{message.content || " "}</pre>
            </article>
          )}
        </li>
      ))}
    </ol>
  );
}
