import type { JSX } from "react";

export function SettingsPanel({
  title,
  className,
  children
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className={className} data-codex-settings-panel="">
      <header>
        <h2>{title}</h2>
      </header>
      <div>{children}</div>
    </section>
  );
}
