import { useCodexChat } from "./useCodexChat";
import type { UseCodexAgentOptions, UseCodexAgentResult } from "./types";

export function useCodexAgent(options: UseCodexAgentOptions = {}): UseCodexAgentResult {
  const chat = useCodexChat(options);
  return {
    ...chat,
    submit: chat.sendMessage
  };
}
