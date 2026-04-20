import type { JSX } from "react";

import { useChatContext } from "../context";
import type { EventInspectorProps } from "../types";

export function EventInspector({ events, rawEvents, className }: EventInspectorProps): JSX.Element {
  const chat = useChatContext();
  const renderedEvents = events ?? chat.events;
  const renderedRawEvents = rawEvents ?? chat.rawEvents;

  return (
    <section className={className} data-codex-event-inspector="">
      <div>
        <h3>Events</h3>
        <ol>
          {renderedEvents.map((event, index) => (
            <li key={`${event.type}-${index}`}>
              <pre>{JSON.stringify(event, null, 2)}</pre>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3>Raw Stream</h3>
        <ol>
          {renderedRawEvents.map((event, index) => (
            <li key={`${index}-${event.type}`}>
              <pre>{JSON.stringify(event, null, 2)}</pre>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
