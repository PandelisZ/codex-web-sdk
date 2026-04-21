import { useEffect, useMemo, useState } from "react";

import { CodexProvider, type CodexPersistenceAdapter } from "@pandelis/codex-web-sdk-react";

import { Workspace } from "./components/Workspace";
import {
  createId,
  createWorkspaceConfig,
  getRuntimeConfig,
  type DemoAppProps
} from "./lib/runtimeConfig";
import {
  loadPresets,
  loadSessionRecord,
  loadSessions,
  removeSessionRecord,
  upsertSessionRecord,
  type WorkspaceSessionRecord
} from "./lib/storage";

function getEventLabel(event: unknown): string {
  return JSON.stringify(event, null, 2);
}

export function App({ wasmURL, transport, initialInput, codexOptions }: DemoAppProps = {}): JSX.Element {
  const runtimeConfig = useMemo(() => getRuntimeConfig(), []);
  const runtimeDefaults = useMemo(
    () => createWorkspaceConfig(runtimeConfig, initialInput),
    [initialInput, runtimeConfig]
  );
  const providerOptions = useMemo(
    () => ({
      ...codexOptions,
      transport,
      wasmURL
    }),
    [codexOptions, transport, wasmURL]
  );
  const [sessions, setSessions] = useState(() => loadSessions());
  const [presets, setPresets] = useState(() => loadPresets());
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const fromHash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    return fromHash || loadSessions()[0]?.id || createId("session");
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleHashChange = () => {
      const next = window.location.hash.replace(/^#/, "");
      if (next) {
        setActiveSessionId(next);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const persistence = useMemo<CodexPersistenceAdapter>(
    () => ({
      loadSession(id) {
        return loadSessionRecord(id)?.chat ?? null;
      },
      saveSession(session) {
        const current = loadSessionRecord(session.id);
        setSessions(
          upsertSessionRecord({
            id: session.id,
            name: current?.name ?? "Current workspace",
            workspace: current?.workspace ?? runtimeDefaults,
            chat: session,
            updatedAt: Date.now()
          })
        );
      },
      clearSession(id) {
        setSessions(removeSessionRecord(id));
      }
    }),
    [runtimeDefaults]
  );

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

  return (
    <CodexProvider
      options={providerOptions}
      persistence={persistence}
    >
      <Workspace
        wasmURL={wasmURL}
        transport={transport}
        codexOptions={codexOptions}
        initialApiKey={runtimeConfig.apiKey}
        activeSessionId={activeSessionId}
        onSessionsChange={setSessions}
        sessions={sessions}
        presets={presets}
        onPresetsChange={setPresets}
        runtimeDefaults={runtimeDefaults}
      />
      <output hidden data-testid="event-log">
        {JSON.stringify(activeSession?.chat?.events.map(getEventLabel) ?? [])}
      </output>
      <output hidden data-testid="assistant-output">
        {activeSession?.chat?.messages.findLast((message) => message.role === "assistant")?.content ?? ""}
      </output>
    </CodexProvider>
  );
}
