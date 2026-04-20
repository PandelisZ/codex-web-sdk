import type { JSX } from "react";

import { useChatContext } from "../context";

export function ModelSelector({
  className,
  models,
  value,
  onChange
}: {
  className?: string;
  models: string[];
  value?: string;
  onChange?: (value: string) => void;
}): JSX.Element {
  const chat = useChatContext();
  const currentValue = value ?? chat.config.model ?? models[0] ?? "";

  return (
    <label className={className} data-codex-model-selector="">
      <span>Model</span>
      <select
        value={currentValue}
        onChange={(event) => (onChange ?? chat.setModel)(event.target.value)}
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </label>
  );
}
