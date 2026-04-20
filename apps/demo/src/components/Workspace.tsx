import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { PanelLeft } from "lucide-react";

import { createBrowserRuntimeAdapter } from "@pandelis/codex-web-sdk";
import { useCodexChat } from "@pandelis/codex-web-sdk-react";
import {
  ChatMessageList,
  ChatRoot,
  ChatStatus,
  ChatTranscript,
  EventInspector,
  McpServerList,
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
import { BrowserToolEditor } from "./BrowserToolEditor";
import { DemoSidebar } from "./DemoSidebar";

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
import { generateToolSchemaFromDescription, toolDraftsToDefinitions } from "../lib/toolDrafts";

const STARTER_PROMPTS = [
  "Explain the architecture of this SDK workspace.",
  "Show me how to use useCodexChat in a React app.",
  "What MCP transports work in the browser vs Node?"
];

const REASONING_OPTIONS = ["minimal", "low", "medium", "high", "xhigh"] as const;
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [generatingSchemaForId, setGeneratingSchemaForId] = useState<string | null>(null);
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

  const handleGenerateSchema = useCallback(
    async (toolId: string, description: string) => {
      setGeneratingSchemaForId(toolId);
      try {
        const nextSchema = await generateToolSchemaFromDescription({
          description,
          config: {
            apiKey: apiKey || undefined,
            baseUrl: chatConfig.baseUrl,
            headers: chatConfig.headers,
            model: chatConfig.model ?? DEFAULT_MODEL,
            reasoning: chatConfig.reasoning,
            fetch: chatConfig.fetch
          },
          wasmUrl
        });

        setToolDrafts((current) =>
          current.map((tool) =>
            tool.id === toolId
              ? {
                  ...tool,
                  inputSchema: nextSchema
                }
              : tool
          )
        );
      } finally {
        setGeneratingSchemaForId(null);
      }
    },
    [apiKey, chatConfig.baseUrl, chatConfig.fetch, chatConfig.headers, chatConfig.model, chatConfig.reasoning, wasmUrl]
  );

  const handleCreateSession = useCallback(() => {
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
    setMobileSidebarOpen(false);
  }, [onSessionsChange]);

  const handleSelectSession = useCallback((sessionId: string, name: string) => {
    window.location.hash = sessionId;
    setSessionName(name);
    setMobileSidebarOpen(false);
  }, []);

  const handleDeleteSession = useCallback(() => {
    onSessionsChange(removeSessionRecord(activeSessionId));
    resetChat();
    setMobileSidebarOpen(false);
  }, [activeSessionId, onSessionsChange, resetChat]);

  const handleResetThread = useCallback(() => {
    resetChat();
    setMobileSidebarOpen(false);
  }, [resetChat]);

  return (
    <div className={`workspaceShell${sidebarCollapsed ? " sidebarCollapsed" : ""}`}>
      <aside className={`leftRail${sidebarCollapsed ? " collapsed" : ""}`}>
        <DemoSidebar
          collapsed={sidebarCollapsed}
          showCollapse
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onCreateSession={handleCreateSession}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onResetThread={handleResetThread}
          apiKeyLoaded={Boolean(apiKey)}
          modelLabel={chatConfig.model ?? DEFAULT_MODEL}
          reasoningLabel={chatConfig.reasoning?.effort ?? DEFAULT_REASONING.effort}
        />
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mobileSidebarButton"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <PanelLeft size={16} />
                  <span>Chats</span>
                </Button>
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
                          {option === "xhigh" ? "x-high" : option}
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
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
        >
          <SheetContent side="left" className="mobileSidebarSheet" showCloseButton>
            <SheetHeader className="overlayHeader">
              <SheetTitle>Chats</SheetTitle>
              <SheetDescription>Switch conversations without leaving the current view.</SheetDescription>
            </SheetHeader>
            <DemoSidebar
              collapsed={false}
              showCollapse={false}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onCreateSession={handleCreateSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              onResetThread={handleResetThread}
              apiKeyLoaded={Boolean(apiKey)}
              modelLabel={chatConfig.model ?? DEFAULT_MODEL}
              reasoningLabel={chatConfig.reasoning?.effort ?? DEFAULT_REASONING.effort}
            />
          </SheetContent>
        </Sheet>

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
                <BrowserToolEditor
                  value={toolDrafts}
                  onChange={setToolDrafts}
                  generatingSchemaForId={generatingSchemaForId}
                  onGenerateSchema={handleGenerateSchema}
                />
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
