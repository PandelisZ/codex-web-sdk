import Editor from "@monaco-editor/react";
import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ToolEditorValue } from "@pandelis/codex-web-sdk-ui";

import { createEmptyBrowserTool } from "../lib/toolDrafts";

type BrowserToolEditorProps = {
  value: ToolEditorValue[];
  onChange: (value: ToolEditorValue[]) => void;
  generatingSchemaForId?: string | null;
  generatingCodeForId?: string | null;
  generationErrorByToolId?: Record<string, string | undefined>;
  onGenerateSchema: (toolId: string, description: string) => Promise<void>;
  onGenerateCode: (toolId: string, description: string) => Promise<void>;
};

function updateTool(
  tools: ToolEditorValue[],
  toolId: string,
  updater: (tool: ToolEditorValue) => ToolEditorValue
): ToolEditorValue[] {
  return tools.map((tool) => (tool.id === toolId ? updater(tool) : tool));
}

export function BrowserToolEditor({
  value,
  onChange,
  generatingSchemaForId,
  generatingCodeForId,
  generationErrorByToolId,
  onGenerateSchema,
  onGenerateCode
}: BrowserToolEditorProps): JSX.Element {
  return (
    <section className="browserToolEditor">
      <header className="toolEditorToolbar">
        <div>
          <h3>Browser Tools</h3>
          <p>These tools execute directly in the demo page as JavaScript.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => onChange([...value, createEmptyBrowserTool()])}>
          Add Tool
        </Button>
      </header>

      <div className="browserToolList">
        {value.map((tool) => (
          <article key={tool.id} className="browserToolCard">
            <div className="toolEditorHeader">
              <strong>{tool.name || "Untitled browser tool"}</strong>
              <span>{tool.description || "Runs directly in the browser environment"}</span>
            </div>

            <label className="toolEditorField">
              <span>Name</span>
              <Input
                value={tool.name}
                placeholder="tool_name"
                onChange={(event) =>
                  onChange(updateTool(value, tool.id, (entry) => ({ ...entry, name: event.target.value })))
                }
              />
            </label>

            <label className="toolEditorField">
              <span>Description</span>
              <Input
                value={tool.description ?? ""}
                placeholder="Describe what the tool does"
                onChange={(event) =>
                  onChange(
                    updateTool(value, tool.id, (entry) => ({ ...entry, description: event.target.value }))
                  )
                }
              />
            </label>

            <label className="toolEditorField">
              <span>Describe schema in English</span>
              <Textarea
                rows={3}
                value={tool.schemaDescription ?? ""}
                placeholder="Example: object with city string, optional date string, and units enum of celsius or fahrenheit"
                onChange={(event) =>
                  onChange(
                    updateTool(value, tool.id, (entry) => ({
                      ...entry,
                      schemaDescription: event.target.value
                    }))
                  )
                }
              />
            </label>

            <div className="toolEditorActions toolEditorActionsStart">
              <Button
                type="button"
                variant="outline"
                disabled={generatingSchemaForId === tool.id}
                onClick={() => void onGenerateSchema(tool.id, tool.schemaDescription ?? "")}
              >
                {generatingSchemaForId === tool.id ? "Generating schema..." : "Generate schema"}
              </Button>
            </div>

            <label className="toolEditorField">
              <span>Describe code in English</span>
              <Textarea
                rows={4}
                value={tool.codeDescription ?? ""}
                placeholder="Example: validate the city input, fetch weather from a public API, and return forecast plus normalized location details"
                onChange={(event) =>
                  onChange(
                    updateTool(value, tool.id, (entry) => ({
                      ...entry,
                      codeDescription: event.target.value
                    }))
                  )
                }
              />
            </label>

            <div className="toolEditorActions toolEditorActionsStart">
              <Button
                type="button"
                variant="outline"
                disabled={generatingCodeForId === tool.id}
                onClick={() => void onGenerateCode(tool.id, tool.codeDescription ?? tool.description ?? "")}
              >
                {generatingCodeForId === tool.id ? "Generating code..." : "Generate code"}
              </Button>
            </div>

            {generationErrorByToolId?.[tool.id] ? (
              <p className="fieldError" role="alert">
                {generationErrorByToolId[tool.id]}
              </p>
            ) : null}

            <div className="toolEditorField">
              <span>Input schema</span>
              <div className="monacoFrame monacoFrameSmall">
                <Editor
                  height="190px"
                  defaultLanguage="json"
                  language="json"
                  theme="vs-light"
                  value={tool.inputSchema ?? ""}
                  onChange={(nextValue) =>
                    onChange(
                      updateTool(value, tool.id, (entry) => ({
                        ...entry,
                        inputSchema: nextValue ?? ""
                      }))
                    )
                  }
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineNumbers: "off",
                    scrollBeyondLastLine: false,
                    wordWrap: "on"
                  }}
                />
              </div>
            </div>

            <div className="toolEditorField">
              <span>Browser JS</span>
              <div className="monacoFrame monacoFrameLarge">
                <Editor
                  height="260px"
                  defaultLanguage="javascript"
                  language="javascript"
                  theme="vs-light"
                  value={tool.code ?? ""}
                  onChange={(nextValue) =>
                    onChange(
                      updateTool(value, tool.id, (entry) => ({
                        ...entry,
                        code: nextValue ?? ""
                      }))
                    )
                  }
                  options={{
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    wordWrap: "on"
                  }}
                />
              </div>
            </div>

            <div className="toolEditorActions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange(value.filter((entry) => entry.id !== tool.id))}
              >
                Remove tool
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
