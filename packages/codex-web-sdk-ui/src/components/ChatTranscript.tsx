import { useEffect, useRef } from "react";
import type { JSX } from "react";

import { useChatContext } from "../context";

export function ChatTranscript({
  children,
  className
}: {
  children?: React.ReactNode;
  className?: string;
}): JSX.Element {
  const chat = useChatContext();
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const shouldStick =
      chat.status === "submitted" ||
      chat.status === "streaming" ||
      distanceFromBottom < 120;

    if (!shouldStick) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [chat.messages, chat.status]);

  return (
    <section
      ref={containerRef}
      className={className}
      data-codex-chat-transcript=""
      data-status={chat.status}
    >
      {children}
    </section>
  );
}
