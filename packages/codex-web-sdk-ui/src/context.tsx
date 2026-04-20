import { createContext, useContext } from "react";
import type { JSX } from "react";

import type { UseCodexChatResult } from "@pandelis/codex-web-sdk-react";

const ChatContext = createContext<UseCodexChatResult | null>(null);

export function ChatRoot({ chat, children, className }: { chat: UseCodexChatResult; children: React.ReactNode; className?: string }): JSX.Element {
  return (
    <ChatContext.Provider value={chat}>
      <section className={className} data-codex-chat-root="">
        {children}
      </section>
    </ChatContext.Provider>
  );
}

export function useChatContext(): UseCodexChatResult {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error("Chat UI components must be rendered inside ChatRoot or receive explicit props.");
  }

  return value;
}
