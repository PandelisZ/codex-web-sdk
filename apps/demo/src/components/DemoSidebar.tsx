import { ChevronLeft, ChevronRight, MessageSquare, PencilLine, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import type { WorkspacePreset, WorkspaceSessionRecord } from "../lib/storage";

type DemoSidebarProps = {
  collapsed: boolean;
  showCollapse: boolean;
  onToggleCollapse?: () => void;
  sessions: WorkspaceSessionRecord[];
  activeSessionId: string;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string, sessionName: string) => void;
  onDeleteSession: () => void;
  onResetThread: () => void;
  apiKeyLoaded: boolean;
  modelLabel: string;
  reasoningLabel: string;
};

export function DemoSidebar({
  collapsed,
  showCollapse,
  onToggleCollapse,
  sessions,
  activeSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onResetThread,
  apiKeyLoaded,
  modelLabel,
  reasoningLabel
}: DemoSidebarProps): JSX.Element {
  return (
    <Card className="railShell">
      <CardHeader className="railShellHeader">
        <div className="railTopbar">
          <div>
            {!collapsed ? <p className="eyebrow">Demo</p> : null}
            {collapsed ? (
              <CardTitle className="text-[2rem] tracking-tight">C</CardTitle>
            ) : (
              <CardTitle className="text-[2rem] tracking-tight">Codex Chat</CardTitle>
            )}
          </div>
          {showCollapse ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="sidebarToggle"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </Button>
          ) : null}
        </div>
        {!collapsed ? (
          <CardDescription className="mt-3 text-sm leading-6">
            A chat-first demo for the core SDK, React bindings, and headless UI package.
          </CardDescription>
        ) : null}
      </CardHeader>

      <Separator className="railSeparator" />

      <div className="railSection">
        {!collapsed ? (
          <div className="railHeader">
            <h2>Chats</h2>
            <Button type="button" variant="outline" size="sm" onClick={onCreateSession} aria-label="New chat">
              <PencilLine size={16} />
              <span>New</span>
            </Button>
          </div>
        ) : (
          <div className="railCollapsedActions">
            <Button type="button" variant="outline" size="icon-sm" onClick={onCreateSession} aria-label="New chat">
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
                  onClick={() => onSelectSession(session.id, session.name)}
                  title={session.name}
                >
                  {collapsed ? (
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
        {!collapsed ? (
          <div className="actionRow">
            <Button type="button" variant="outline" onClick={onDeleteSession}>
              Delete Session
            </Button>
            <Button type="button" variant="outline" onClick={onResetThread}>
              Reset Thread
            </Button>
          </div>
        ) : null}
      </div>

      {!collapsed ? <Separator className="railSeparator" /> : null}

      {!collapsed ? (
        <div className="railSection railMetaCard">
          <div className="metaRow">
            <span>API key</span>
            <strong>{apiKeyLoaded ? "Loaded" : "Missing"}</strong>
          </div>
          <div className="metaRow">
            <span>Model</span>
            <strong>{modelLabel}</strong>
          </div>
          <div className="metaRow">
            <span>Reasoning</span>
            <strong>{reasoningLabel}</strong>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
