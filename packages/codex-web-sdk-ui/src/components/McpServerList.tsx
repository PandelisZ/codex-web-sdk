import type { JSX } from "react";

import type { McpServerDescriptor } from "@pandelis/codex-web-sdk";

import type { McpServerListProps } from "../types";

function createEmptyDescriptor(): McpServerDescriptor {
  return {
    id: `mcp_${Math.random().toString(36).slice(2)}`,
    name: "New MCP server",
    transport: "streamable-http",
    url: "https://example.com/mcp"
  };
}

export function McpServerList({ value, onChange, statuses = [], className }: McpServerListProps): JSX.Element {
  return (
    <section className={className} data-codex-mcp-list="">
      <header>
        <h3>MCP Servers</h3>
        <button type="button" onClick={() => onChange([...value, createEmptyDescriptor()])}>
          Add Server
        </button>
      </header>
      <div>
        {value.map((server) => {
          const status = statuses.find((entry) => entry.serverId === server.id);
          return (
            <article key={server.id} data-codex-mcp-row="" data-transport={server.transport}>
              <div className="mcpEditorHeader">
                <strong>{server.name ?? server.id}</strong>
                <span>{server.transport}</span>
              </div>
              <label className="toolEditorField">
                <span>Server id</span>
                <input
                  value={server.id}
                  onChange={(event) =>
                    onChange(
                      value.map((entry) =>
                        entry.id === server.id ? { ...entry, id: event.target.value } : entry
                      )
                    )
                  }
                />
              </label>
              <label className="toolEditorField">
                <span>Display name</span>
                <input
                  value={server.name ?? ""}
                  placeholder="Name"
                  onChange={(event) =>
                    onChange(
                      value.map((entry) =>
                        entry.id === server.id ? { ...entry, name: event.target.value } : entry
                      )
                    )
                  }
                />
              </label>
              <label className="toolEditorField">
                <span>Transport</span>
                <select
                  value={server.transport}
                  onChange={(event) => {
                    const nextTransport = event.target.value as McpServerDescriptor["transport"];
                    onChange(
                      value.map((entry) => {
                        if (entry.id !== server.id) {
                          return entry;
                        }

                        if (nextTransport === "stdio") {
                          return {
                            id: entry.id,
                            name: entry.name,
                            transport: "stdio",
                            command: "node",
                            args: ["./server.mjs"]
                          };
                        }

                        return {
                          id: entry.id,
                          name: entry.name,
                          transport: nextTransport,
                          url: "https://example.com/mcp"
                        };
                      })
                    );
                  }}
                >
                  <option value="streamable-http">streamable-http</option>
                  <option value="sse">sse</option>
                  <option value="websocket">websocket</option>
                  <option value="stdio">stdio</option>
                </select>
              </label>
              {"url" in server ? (
                <label className="toolEditorField">
                  <span>Endpoint</span>
                  <input
                    value={server.url}
                    placeholder="Endpoint URL"
                    onChange={(event) =>
                      onChange(
                        value.map((entry) =>
                          entry.id === server.id && "url" in entry
                            ? { ...entry, url: event.target.value }
                            : entry
                        )
                      )
                    }
                  />
                </label>
              ) : (
                <label className="toolEditorField">
                  <span>Command</span>
                  <input
                    value={server.command}
                    placeholder="Command"
                    onChange={(event) =>
                      onChange(
                        value.map((entry) =>
                          entry.id === server.id && entry.transport === "stdio"
                            ? { ...entry, command: event.target.value }
                            : entry
                        )
                      )
                    }
                  />
                </label>
              )}
              {status ? (
                <p data-codex-mcp-status="" data-available={String(status.available)}>
                  {status.available
                    ? `${status.toolCount ?? 0} tools`
                    : status.reason ?? (status.nodeOnly ? "Node-only" : "Unavailable")}
                </p>
              ) : null}
              <button type="button" onClick={() => onChange(value.filter((entry) => entry.id !== server.id))}>
                Remove
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
