import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, MessageSquare, PencilLine, Sparkles } from "lucide-react";

import { createBrowserRuntimeAdapter } from "@pandelis/codex-web-sdk";
import { useCodexChat } from "@pandelis/codex-web-sdk-react";
import {
  ChatMessageList,
  ChatRoot,
  ChatStatus,
  ChatTranscript,
  EventInspector,
  McpServerList,
  ToolEditor,
  type ToolEditorValue
} from "@pandelis/codex-web-sdk-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

import {
  createId,
  DEFAULT_MODEL,
  DEFAULT_REASONING,
  MODEL_OPTIONS,
  type WorkspacePaneProps
} from "../lib/runtimeConfig";
import {
  loadSessionRecord,
  readStoredApiKey,
  removeSessionRecord,
  savePresets,
  saveWorkspaceSnapshot,
  upsertSessionRecord,
  writeStoredApiKey,
  type WorkspaceConfig
} from "../lib/storage";
import { toolDraftsToDefinitions } from "../lib/toolDrafts";

const STARTER_PROMPTS = [
  "Explain the architecture of this SDK workspace.",
  "Show me how to use useCodexChat in a React app.",
  "What MCP transports work in the browser vs Node?"
];

const REASONING_OPTIONS = ["minimal", "low", "medium", "high"] as const;
type InspectorPanel = "settings" | "tools" | "mcp" | "events" | null;

function getPrimaryComposerLabel(args: {
  hasConfiguredTransport: boolean;
  status: string;
  hasMessages: boolean;
}): string {
  if (!args.hasConfiguredTransport) {
    return "Add API key to start";
  }

  if (args.status === "submitted" || args.status === "streaming") {
    return "Streaming...";
  }

  return args.hasMessages ? "Send message" : "Start chat";
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "user":
      return "Message";
    case "assistant":
      return "Reply";
    case "reasoning":
      return "Reasoning";
    case "tool_call":
      return "Tool";
    case "tool_result":
      return "Result";
    case "error":
      return "Error";
    default:
      return role;
  }
}

function shouldSubmitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;
}

export function Workspace({
  wasmUrl,
  transport,
  agentOptions,
  initialApiKey,
  activeSessionId,
  onSessionsChange,
  sessions,
  presets,
  onPresetsChange,
  runtimeDefaults
}: WorkspacePaneProps): JSX.Element {
  const [apiKey, setApiKey] = useState(() => readStoredApiKey() || initialApiKey || "");
  const [toolDrafts, setToolDrafts] = useState<ToolEditorValue[]>(runtimeDefaults.toolDrafts);
  const [mcpServers, setMcpServers] = useState(runtimeDefaults.mcpServers);
  const [sessionName, setSessionName] = useState("Current workspace");
  const [presetDraftName, setPresetDraftName] = useState("Workspace preset");
  const [activeInspector, setActiveInspector] = useState<InspectorPanel>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mcpStatuses, setMcpStatuses] = useState<
    Array<{
      serverId: string;
      available: boolean;
      reason?: string;
      nodeOnly: boolean;
      toolCount?: number;
    }>
  >([]);

  const chat = useCodexChat({
    sessionId: activeSessionId,
    initialInput: runtimeDefaults.prompt,
    config: {
      ...agentOptions,
      apiKey: apiKey || undefined,
      baseUrl: runtimeDefaults.baseUrl ?? agentOptions?.baseUrl,
      model: runtimeDefaults.model,
      reasoning: runtimeDefaults.reasoning,
      systemPrompt: runtimeDefaults.systemPrompt,
      tools: toolDraftsToDefinitions(runtimeDefaults.toolDrafts),
      mcpServers: runtimeDefaults.mcpServers,
      transport,
      wasmUrl
    }
  });

  const {
    config: chatConfig,
    events: chatEvents,
    input: chatInput,
    messages: chatMessages,
    rawEvents: chatRawEvents,
    reset: resetChat,
    setConfig: applyChatConfig,
    setInput: applyChatInput,
    setMcpServers: applyChatMcpServers,
    setReasoning: applyReasoning,
    setTools: applyTools
  } = chat;

  const workspaceRef = useRef<WorkspaceConfig>(runtimeDefaults);
  const workspaceSignature = JSON.stringify({
    baseUrl: chatConfig.baseUrl,
    model: chatConfig.model,
    reasoning: chatConfig.reasoning,
    systemPrompt: chatConfig.systemPrompt,
    prompt: chatInput,
    toolDrafts,
    mcpServers
  });

  useEffect(() => {
    writeStoredApiKey(apiKey);
    applyChatConfig({
      apiKey: apiKey || undefined
    });
  }, [apiKey, applyChatConfig]);

  useEffect(() => {
    applyTools(toolDraftsToDefinitions(toolDrafts));
  }, [applyTools, toolDrafts]);

  useEffect(() => {
    applyChatMcpServers(mcpServers);
  }, [applyChatMcpServers, mcpServers]);

  useEffect(() => {
    const adapter = createBrowserRuntimeAdapter();
    const registry = adapter.createMcpRegistry({
      servers: mcpServers
    });
    let cancelled = false;

    void registry.getServerStatuses().then((statuses) => {
      if (!cancelled) {
        setMcpStatuses(statuses);
      }
    });

    return () => {
      cancelled = true;
      void registry.dispose();
    };
  }, [mcpServers]);

  useEffect(() => {
    const record = loadSessionRecord(activeSessionId);
    if (!record) {
      resetChat();
      setToolDrafts(runtimeDefaults.toolDrafts);
      setMcpServers(runtimeDefaults.mcpServers);
      applyChatConfig({
        ...agentOptions,
        apiKey: apiKey || undefined,
        baseUrl: runtimeDefaults.baseUrl,
        model: runtimeDefaults.model,
        reasoning: runtimeDefaults.reasoning,
        systemPrompt: runtimeDefaults.systemPrompt,
        tools: toolDraftsToDefinitions(runtimeDefaults.toolDrafts),
        mcpServers: runtimeDefaults.mcpServers,
        transport,
        wasmUrl
      });
      applyChatInput(runtimeDefaults.prompt);
      setSessionName("Current workspace");
      return;
    }

    setSessionName(record.name);
    setToolDrafts(record.workspace.toolDrafts);
    setMcpServers(record.workspace.mcpServers);
    applyChatConfig({
      apiKey: apiKey || undefined,
      baseUrl: record.workspace.baseUrl,
      model: record.workspace.model,
      reasoning: record.workspace.reasoning,
      systemPrompt: record.workspace.systemPrompt,
      tools: toolDraftsToDefinitions(record.workspace.toolDrafts),
      mcpServers: record.workspace.mcpServers
    });
    applyChatInput(record.workspace.prompt);
  }, [
    activeSessionId,
    agentOptions,
    apiKey,
    applyChatConfig,
    applyChatInput,
    resetChat,
    runtimeDefaults,
    transport,
    wasmUrl
  ]);

  useEffect(() => {
    const nextWorkspace: WorkspaceConfig = {
      baseUrl: chatConfig.baseUrl,
      model: chatConfig.model ?? DEFAULT_MODEL,
      reasoning: chatConfig.reasoning ?? DEFAULT_REASONING,
      systemPrompt: chatConfig.systemPrompt ?? "",
      prompt: chatInput,
      toolDrafts,
      mcpServers
    };
    workspaceRef.current = nextWorkspace;

    const existing = loadSessionRecord(activeSessionId);
    onSessionsChange(
      saveWorkspaceSnapshot({
        id: activeSessionId,
        name: existing?.name ?? sessionName,
        workspace: nextWorkspace,
        chat: existing?.chat ?? null
      })
    );
  }, [activeSessionId, onSessionsChange, sessionName, workspaceSignature]);

  useEffect(() => {
    const existing = loadSessionRecord(activeSessionId);
    onSessionsChange(
      saveWorkspaceSnapshot({
        id: activeSessionId,
        name: existing?.name ?? sessionName,
        workspace: {
          baseUrl: chatConfig.baseUrl,
          model: chatConfig.model ?? DEFAULT_MODEL,
          reasoning: chatConfig.reasoning ?? DEFAULT_REASONING,
          systemPrompt: chatConfig.systemPrompt ?? "",
          prompt: chatInput,
          toolDrafts,
          mcpServers
        },
        chat: existing?.chat ?? null
      })
    );
  }, [activeSessionId, chatConfig.baseUrl, chatConfig.model, chatConfig.reasoning, chatConfig.systemPrompt, chatInput, mcpServers, onSessionsChange, sessionName, toolDrafts]);

  const hasConfiguredTransport =
    Boolean(transport) || Boolean(chatConfig.baseUrl) || Boolean(apiKey) || Boolean(agentOptions?.transport);
  const hasMessages = chatMessages.length > 0;
  const primaryComposerLabel = getPrimaryComposerLabel({
    hasConfiguredTransport,
    status: chat.status,
    hasMessages
  });

  return (
    <div className={`workspaceShell${sidebarCollapsed ? " sidebarCollapsed" : ""}`}>
      <aside className={`leftRail${sidebarCollapsed ? " collapsed" : ""}`}>
        <Card className="railShell">
          <CardHeader className="railShellHeader">
            <div className="railTopbar">
              <div>
                {!sidebarCollapsed ? <p className="eyebrow">Demo</p> : null}
                {sidebarCollapsed ? (
                  <CardTitle className="text-[2rem] tracking-tight">C</CardTitle>
                ) : (
                  <CardTitle className="text-[2rem] tracking-tight">Codex Chat</CardTitle>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="sidebarToggle"
                onClick={() => setSidebarCollapsed((current) => !current)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </Button>
            </div>
            {!sidebarCollapsed ? (
              <CardDescription className="mt-3 text-sm leading-6">
                A chat-first demo for the core SDK, React bindings, and headless UI package.
              </CardDescription>
            ) : null}
          </CardHeader>

          <Separator className="railSeparator" />

          <div className="railSection">
            {!sidebarCollapsed ? (
              <div className="railHeader">
                <h2>Chats</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const id = createId("session");
                    onSessionsChange(
                      upsertSessionRecord({
                        id,
                        name: "New session",
                        workspace: workspaceRef.current,
                        chat: null,
                        updatedAt: Date.now()
                      })
                    );
                    window.location.hash = id;
                }}
                aria-label="New chat"
              >
                  <PencilLine size={16} />
                  <span>New</span>
                </Button>
              </div>
            ) : (
              <div className="railCollapsedActions">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => {
                    const id = createId("session");
                    onSessionsChange(
                      upsertSessionRecord({
                        id,
                        name: "New session",
                        workspace: workspaceRef.current,
                        chat: null,
                        updatedAt: Date.now()
                      })
                    );
                    window.location.hash = id;
                  }}
                  aria-label="New chat"
                >
                  <PencilLine size={16} />
                </Button>
              </div>
            )}
            <ScrollArea className="railScrollArea">
              <ul className="stackList">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={session.id === activeSessionId ? "listButton active" : "listButton"}
                      onClick={() => {
                        window.location.hash = session.id;
                        setSessionName(session.name);
                      }}
                      title={session.name}
                    >
                      {sidebarCollapsed ? (
                        <span className="listButtonGlyph" aria-hidden="true">
                          {session.id === activeSessionId ? <Sparkles size={18} /> : <MessageSquare size={18} />}
                        </span>
                      ) : (
                        <>
                          <span className="listButtonLeading" aria-hidden="true">
                            {session.id === activeSessionId ? <Sparkles size={16} /> : <MessageSquare size={16} />}
                          </span>
                          <span className="listButtonMeta">
                            <span className="listButtonTitle">{session.name}</span>
                            <small>{new Date(session.updatedAt).toLocaleTimeString()}</small>
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
            {!sidebarCollapsed ? (
              <div className="actionRow">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onSessionsChange(removeSessionRecord(activeSessionId));
                    resetChat();
                  }}
                >
                  Delete Session
                </Button>
                <Button type="button" variant="outline" onClick={() => resetChat()}>
                  Reset Thread
                </Button>
              </div>
            ) : null}
          </div>

          {!sidebarCollapsed ? <Separator className="railSeparator" /> : null}

          {!sidebarCollapsed ? (
            <div className="railSection railMetaCard">
              <div className="metaRow">
                <span>API key</span>
                <strong>{apiKey ? "Loaded" : "Missing"}</strong>
              </div>
              <div className="metaRow">
                <span>Model</span>
                <strong>{chatConfig.model ?? DEFAULT_MODEL}</strong>
              </div>
              <div className="metaRow">
                <span>Reasoning</span>
                <strong>{chatConfig.reasoning?.effort ?? DEFAULT_REASONING.effort}</strong>
              </div>
            </div>
          ) : null}
        </Card>
      </aside>

      <ChatRoot chat={chat}>
        <main className="centerPane">
          <div className="chatRoot">
            <div className="conversationHeader chatAppHeader">
              <div>
                <p className="conversationEyebrow">New chat</p>
                <h2>{sessionName || "Untitled chat"}</h2>
                <p className="conversationSubtle">
                  {chatMessages.length > 0
                    ? "Conversation in progress"
                    : "Start with a prompt or use one of the suggestions below."}
                </p>
              </div>
              <div className="conversationMeta conversationActions">
                <span className="metaChip">{chatConfig.model ?? DEFAULT_MODEL}</span>
                <span className="metaChip">
                  {chatConfig.reasoning?.effort ?? DEFAULT_REASONING.effort}
                </span>
                <Button
                  type="button"
                  variant={activeInspector === "settings" ? "default" : "outline"}
                  size="sm"
                  className="metaChipButton"
                  onClick={() =>
                    setActiveInspector((current) => (current === "settings" ? null : "settings"))
                  }
                >
                  Settings
                </Button>
                <Button
                  type="button"
                  variant={activeInspector === "tools" ? "default" : "outline"}
                  size="sm"
                  className="metaChipButton"
                  onClick={() => setActiveInspector((current) => (current === "tools" ? null : "tools"))}
                >
                  Tools
                </Button>
                <Button
                  type="button"
                  variant={activeInspector === "mcp" ? "default" : "outline"}
                  size="sm"
                  className="metaChipButton"
                  onClick={() => setActiveInspector((current) => (current === "mcp" ? null : "mcp"))}
                >
                  MCP
                </Button>
                <Button
                  type="button"
                  variant={activeInspector === "events" ? "default" : "outline"}
                  size="sm"
                  className="metaChipButton"
                  onClick={() => setActiveInspector((current) => (current === "events" ? null : "events"))}
                >
                  Events
                </Button>
              </div>
            </div>

            <Separator />
            <ChatStatus className="statusBar" />

            <ChatTranscript className={hasMessages ? "transcriptPanel" : "transcriptPanel transcriptPanelEmpty"}>
              {!hasMessages ? (
                <section className="emptyTranscript chatLanding">
                  <div className="introBubble">
                    <p className="introLabel">Codex</p>
                    <h3>What should we build in codex-web-sdk?</h3>
                    <p>
                      {hasConfiguredTransport
                        ? "Ask for debugging help, code generation, architecture advice, or an MCP-backed tool call."
                        : "Enter an API key in the settings panel, then start chatting here."}
                    </p>
                  </div>
                  <div className="starterGrid">
                    {STARTER_PROMPTS.map((prompt) => (
                      <Button
                        key={prompt}
                        type="button"
                        variant="outline"
                        className="starterPrompt"
                        onClick={() => applyChatInput(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}

              <ChatMessageList
                className="messageList"
                renderMessage={(message) => (
                  <div className={`messageRow role-${message.role}`}>
                    <div className={`messageCard role-${message.role}`}>
                      <div className="messageCardBody">
                        <pre>{message.content || " "}</pre>
                      </div>
                    </div>
                  </div>
                )}
              />
            </ChatTranscript>

            <div className="composerShell">
              <div className="composerToolbar">
                <Button
                  type="button"
                  variant={activeInspector === "settings" ? "default" : "outline"}
                  size="sm"
                  className="toolbarToggle"
                  onClick={() => setActiveInspector((current) => (current === "settings" ? null : "settings"))}
                >
                  {apiKey ? "Connected" : "Connect API key"}
                </Button>
                <div className="toolbarSelectors">
                  <Select
                    value={chatConfig.model ?? DEFAULT_MODEL}
                    onValueChange={(value) => applyChatConfig({ model: value })}
                  >
                    <SelectTrigger className="toolbarSelect">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={chatConfig.reasoning?.effort ?? DEFAULT_REASONING.effort}
                    onValueChange={(value) =>
                      applyReasoning({
                        ...(chatConfig.reasoning ?? DEFAULT_REASONING),
                        effort: value as (typeof REASONING_OPTIONS)[number]
                      })
                    }
                  >
                    <SelectTrigger className="toolbarSelect">
                      <SelectValue placeholder="Reasoning" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONING_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="composerCard">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void chat.sendMessage();
                  }}
                >
                  <Textarea
                    value={chatInput}
                    onChange={(event) => applyChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (!shouldSubmitOnEnter(event)) {
                        return;
                      }

                      event.preventDefault();
                      void chat.sendMessage();
                    }}
                    className="composerTextarea"
                    placeholder="Ask Codex to explain code, build a feature, or inspect an MCP tool..."
                  />
                  <div data-codex-composer-actions="">
                    {chat.status === "submitted" || chat.status === "streaming" ? (
                      <Button type="button" variant="outline" onClick={() => chat.stop()}>
                        Stop
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      disabled={
                        !hasConfiguredTransport ||
                        !chatInput.trim() ||
                        chat.status === "submitted" ||
                        chat.status === "streaming"
                      }
                    >
                      {primaryComposerLabel}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </main>

        <Sheet
          open={activeInspector !== null}
          onOpenChange={(open) => {
            if (!open) {
              setActiveInspector(null);
            }
          }}
        >
          <SheetContent side="right" className="overlayPane" showCloseButton>
            <SheetHeader className="overlayHeader">
              <SheetTitle>
                {activeInspector === "settings"
                  ? "Chat Settings"
                  : activeInspector === "tools"
                    ? "Tools"
                    : activeInspector === "mcp"
                      ? "MCP Servers"
                      : "Events"}
              </SheetTitle>
              <SheetDescription>
                Adjust the live chat runtime without leaving the conversation view.
              </SheetDescription>
            </SheetHeader>

            {activeInspector === "settings" ? (
              <div className="overlayCard">
                <div className="controlGrid">
                  <label className="field">
                    <span>OpenAI API key</span>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      placeholder="sk-..."
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Base URL</span>
                    <Input
                      value={chatConfig.baseUrl ?? ""}
                      placeholder="https://api.openai.com/v1"
                      onChange={(event) => applyChatConfig({ baseUrl: event.target.value || undefined })}
                    />
                  </label>
                  <label className="field">
                    <span>System prompt</span>
                    <Textarea
                      rows={6}
                      value={chatConfig.systemPrompt ?? ""}
                      onChange={(event) => applyChatConfig({ systemPrompt: event.target.value })}
                    />
                  </label>
                  <label className="field checkboxField">
                    <span>Reasoning summary</span>
                    <input
                      type="checkbox"
                      checked={(chatConfig.reasoning?.summary ?? "auto") !== "none"}
                      onChange={(event) =>
                        applyReasoning({
                          effort: chatConfig.reasoning?.effort ?? "medium",
                          summary: event.target.checked ? "auto" : "none"
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Session label</span>
                    <Input
                      value={sessionName}
                      onChange={(event) => {
                        setSessionName(event.target.value);
                        const current = loadSessionRecord(activeSessionId);
                        if (!current) {
                          return;
                        }
                        onSessionsChange(
                          upsertSessionRecord({
                            ...current,
                            name: event.target.value,
                            updatedAt: Date.now()
                          })
                        );
                      }}
                    />
                  </label>
                  <Separator />
                  <div className="railHeader">
                    <h2>Presets</h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const preset = {
                          id: createId("preset"),
                          name: presetDraftName || "Workspace preset",
                          config: workspaceRef.current,
                          updatedAt: Date.now()
                        };
                        const next = [preset, ...presets];
                        savePresets(next);
                        onPresetsChange(next);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                  <label className="field">
                    <span>Preset name</span>
                    <Input value={presetDraftName} onChange={(event) => setPresetDraftName(event.target.value)} />
                  </label>
                  <ScrollArea className="overlayListArea">
                    <ul className="stackList">
                      {presets.map((preset) => (
                        <li key={preset.id}>
                          <button
                            type="button"
                            className="listButton listButtonLight"
                            onClick={() => {
                              setToolDrafts(preset.config.toolDrafts);
                              setMcpServers(preset.config.mcpServers);
                              applyChatConfig({
                                baseUrl: preset.config.baseUrl,
                                model: preset.config.model,
                                reasoning: preset.config.reasoning,
                                systemPrompt: preset.config.systemPrompt,
                                tools: toolDraftsToDefinitions(preset.config.toolDrafts),
                                mcpServers: preset.config.mcpServers
                              });
                              applyChatInput(preset.config.prompt);
                            }}
                          >
                            <span className="listButtonTitle">{preset.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              </div>
            ) : null}

            {activeInspector === "tools" ? (
              <div className="overlayCard">
                <ToolEditor value={toolDrafts} onChange={setToolDrafts} />
              </div>
            ) : null}

            {activeInspector === "mcp" ? (
              <div className="overlayCard">
                <McpServerList value={mcpServers} onChange={setMcpServers} statuses={mcpStatuses} />
              </div>
            ) : null}

            {activeInspector === "events" ? (
              <div className="overlayCard inspectorEvents">
                <EventInspector events={chatEvents} rawEvents={chatRawEvents} />
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      </ChatRoot>
    </div>
  );
}
