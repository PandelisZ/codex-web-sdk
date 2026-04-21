import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { UseCodexChatResult } from "@pandelis/codex-web-sdk-react";

import {
  ChatComposer,
  ChatRoot,
  EventInspector,
  McpServerList,
  ModelSelector,
  ReasoningSelector,
  ToolEditor
} from "../src/index";

function createChatStub(): UseCodexChatResult {
  return {
    thread: {} as never,
    messages: [
      {
        id: "assistant_1",
        role: "assistant",
        content: "hello",
        createdAt: Date.now(),
        status: "ready"
      }
    ],
    events: [
      {
        type: "turn.started"
      }
    ],
    rawEvents: [
      {
        type: "response.output_text.delta",
        delta: "hello"
      }
    ],
    input: "draft",
    setInput: vi.fn(),
    status: "ready",
    error: null,
    usage: null,
    threadId: "thread_1",
    threadOptions: {
      model: "gpt-5.1-codex",
      reasoning: {
        effort: "medium"
      }
    },
    sendMessage: vi.fn(async () => {}),
    stop: vi.fn(),
    reload: vi.fn(async () => {}),
    reset: vi.fn(),
    setModel: vi.fn(),
    setReasoning: vi.fn(),
    setTools: vi.fn(),
    setMcpServers: vi.fn(),
    setThreadOptions: vi.fn(),
    restoreSession: vi.fn(),
    snapshotSession: vi.fn()
  };
}

describe("headless UI package", () => {
  it("wires composer and selector controls into chat state", async () => {
    const user = userEvent.setup();
    const chat = createChatStub();
    render(
      <ChatRoot chat={chat}>
        <ChatComposer />
        <ModelSelector models={["gpt-5.1-codex", "gpt-5.4"]} />
        <ReasoningSelector />
      </ChatRoot>
    );

    await user.type(screen.getByRole("textbox"), "!");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.selectOptions(screen.getByDisplayValue("gpt-5.1-codex"), "gpt-5.4");
    await user.selectOptions(screen.getByDisplayValue("medium"), "high");

    expect(chat.setInput).toHaveBeenCalled();
    expect(chat.sendMessage).toHaveBeenCalled();
    expect(chat.setModel).toHaveBeenCalledWith("gpt-5.4");
    expect(chat.setReasoning).toHaveBeenCalledWith({
      effort: "high"
    });
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });

  it("shows the stop control only while a turn is active", () => {
    const chat = createChatStub();
    chat.status = "streaming";

    render(
      <ChatRoot chat={chat}>
        <ChatComposer />
      </ChatRoot>
    );

    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
  });

  it("renders tool, MCP, and event inspectors as controlled editors", async () => {
    const user = userEvent.setup();
    const onToolsChange = vi.fn();
    const onMcpChange = vi.fn();

    render(
      <ChatRoot chat={createChatStub()}>
        <ToolEditor
          value={[
            {
              id: "tool_1",
              name: "lookup",
              description: "desc",
              inputSchema: "{}",
              output: "{\"ok\":true}"
            }
          ]}
          onChange={onToolsChange}
        />
        <McpServerList
          value={[
            {
              id: "remote_math",
              transport: "streamable-http",
              url: "https://example.com/mcp"
            }
          ]}
          onChange={onMcpChange}
          statuses={[
            {
              serverId: "remote_math",
              available: false,
              nodeOnly: false,
              reason: "offline"
            }
          ]}
        />
        <EventInspector />
      </ChatRoot>
    );

    await user.click(screen.getByRole("button", { name: "Add Tool" }));
    await user.click(screen.getByRole("button", { name: "Add Server" }));

    expect(onToolsChange).toHaveBeenCalled();
    expect(onMcpChange).toHaveBeenCalled();
    expect(screen.getByText("offline")).toBeTruthy();
    expect(screen.getByText(/response\.output_text\.delta/)).toBeTruthy();
  });
});
