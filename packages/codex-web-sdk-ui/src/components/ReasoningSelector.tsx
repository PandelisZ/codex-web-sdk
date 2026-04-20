import type { JSX } from "react";

import type { ReasoningEffort } from "@pandelis/codex-web-sdk";

import { useChatContext } from "../context";

const REASONING_OPTIONS: ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh"];

export function ReasoningSelector({
  className,
  value,
  onChange
}: {
  className?: string;
  value?: ReasoningEffort;
  onChange?: (value: ReasoningEffort) => void;
}): JSX.Element {
  const chat = useChatContext();
  const currentValue = value ?? chat.config.reasoning?.effort ?? "medium";

  return (
    <label className={className} data-codex-reasoning-selector="">
      <span>Reasoning</span>
      <select
        value={currentValue}
        onChange={(event) => {
          const next = event.target.value as ReasoningEffort;
          if (onChange) {
            onChange(next);
            return;
          }

          chat.setReasoning({
            ...(chat.config.reasoning ?? {}),
            effort: next
          });
        }}
      >
        {REASONING_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === "xhigh" ? "x-high" : option}
          </option>
        ))}
      </select>
    </label>
  );
}
