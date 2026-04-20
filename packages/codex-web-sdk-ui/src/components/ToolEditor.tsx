import { useId } from "react";
import type { JSX } from "react";

import type { ToolEditorProps, ToolEditorValue } from "../types";

function createEmptyTool(): ToolEditorValue {
  return {
    id: `tool_${Math.random().toString(36).slice(2)}`,
    name: "",
    description: "",
    inputSchema: "{\n  \"type\": \"object\"\n}",
    output: "{\n  \"ok\": true\n}"
  };
}

export function ToolEditor({ value, onChange, className }: ToolEditorProps): JSX.Element {
  const labelId = useId();

  return (
    <section className={className} data-codex-tool-editor="">
      <header className="toolEditorToolbar">
        <div>
          <h3 id={labelId}>Mock Tools</h3>
          <p>Define local tools and their demo responses.</p>
        </div>
        <button type="button" onClick={() => onChange([...value, createEmptyTool()])}>
          Add Tool
        </button>
      </header>
      <div aria-labelledby={labelId}>
        {value.map((tool) => (
          <article key={tool.id} data-codex-tool-row="">
            <div className="toolEditorHeader">
              <strong>{tool.name || "Untitled tool"}</strong>
              <span>{tool.description || "Mock local tool"}</span>
            </div>
            <label className="toolEditorField">
              <span>Name</span>
              <input
                value={tool.name}
                placeholder="tool_name"
                onChange={(event) =>
                  onChange(
                    value.map((entry) =>
                      entry.id === tool.id ? { ...entry, name: event.target.value } : entry
                    )
                  )
                }
              />
            </label>
            <label className="toolEditorField">
              <span>Description</span>
              <input
                value={tool.description ?? ""}
                placeholder="Describe when this tool should be used"
                onChange={(event) =>
                  onChange(
                    value.map((entry) =>
                      entry.id === tool.id ? { ...entry, description: event.target.value } : entry
                    )
                  )
                }
              />
            </label>
            <label className="toolEditorField">
              <span>Input schema</span>
              <textarea
                value={tool.inputSchema ?? ""}
                rows={5}
                onChange={(event) =>
                  onChange(
                    value.map((entry) =>
                      entry.id === tool.id ? { ...entry, inputSchema: event.target.value } : entry
                    )
                  )
                }
              />
            </label>
            <label className="toolEditorField">
              <span>Mock result</span>
              <textarea
                value={tool.output ?? ""}
                rows={5}
                onChange={(event) =>
                  onChange(
                    value.map((entry) =>
                      entry.id === tool.id ? { ...entry, output: event.target.value } : entry
                    )
                  )
                }
              />
            </label>
            <div className="toolEditorActions">
              <button type="button" onClick={() => onChange(value.filter((entry) => entry.id !== tool.id))}>
                Remove tool
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
