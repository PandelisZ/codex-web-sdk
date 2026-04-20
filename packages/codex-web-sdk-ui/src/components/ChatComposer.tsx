import type { JSX } from "react";

import { useChatContext } from "../context";

export function ChatComposer({
  className,
  value,
  onChange,
  onSubmit,
  submitLabel = "Send",
  submitDisabled,
  placeholder = "Message Codex...",
  stopLabel = "Stop",
  hideStopWhenIdle = true
}: {
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  submitDisabled?: boolean;
  placeholder?: string;
  stopLabel?: string;
  hideStopWhenIdle?: boolean;
}): JSX.Element {
  const chat = useChatContext();
  const currentValue = value ?? chat.input;
  const handleChange = onChange ?? ((next: string) => chat.setInput(next));
  const handleSubmit = onSubmit ?? (() => chat.sendMessage());
  const isRunning = chat.status === "submitted" || chat.status === "streaming";
  const isSubmitDisabled = submitDisabled ?? isRunning;
  const showStop = hideStopWhenIdle ? isRunning : true;

  return (
    <form
      className={className}
      data-codex-composer=""
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <textarea
        value={currentValue}
        onChange={(event) => handleChange(event.target.value)}
        data-codex-composer-input=""
        rows={4}
        placeholder={placeholder}
      />
      <div data-codex-composer-actions="">
        <button type="submit" disabled={isSubmitDisabled}>
          {submitLabel}
        </button>
        {showStop ? (
          <button type="button" onClick={() => chat.stop()} data-variant="secondary">
            {stopLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
