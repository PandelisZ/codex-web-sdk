import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createDemoMockTransport } from "@pandelis/codex-web-sdk";
import { MockResponsesTransport } from "@pandelis/codex-web-sdk";

import { useCodexChat } from "../src/useCodexChat";
import { loadTestWasmModule } from "../../codex-web-sdk/test/loadWasm";

function ChatHarness({ wasmUrl }: { wasmUrl: Uint8Array }) {
  const chat = useCodexChat({
    config: {
      transport: createDemoMockTransport(),
      wasmUrl,
      tools: [
        {
          name: "weather_lookup",
          execute: async (input) => ({
            ...(input as Record<string, unknown>),
            summary: "Sunny, 24C, light sea breeze"
          })
        }
      ]
    },
    initialInput: "Plan a Saturday picnic in Limassol."
  });

  useEffect(() => {
    void chat.sendMessage();
  }, []);

  return (
    <div>
      <div data-testid="status">{chat.status}</div>
      <div data-testid="roles">{chat.messages.map((message) => message.role).join(",")}</div>
      <div data-testid="assistant">
        {chat.messages.findLast((message) => message.role === "assistant")?.content ?? ""}
      </div>
    </div>
  );
}

describe("useCodexChat", () => {
  it("normalizes user, assistant, tool call, and tool result messages", async () => {
    const wasmUrl = await loadTestWasmModule();
    render(<ChatHarness wasmUrl={wasmUrl} />);

    await waitFor(() => {
      expect(screen.getByTestId("assistant").textContent).toContain("The weather looks sunny at 24C");
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("roles").textContent).toContain("user");
    expect(screen.getByTestId("roles").textContent).toContain("assistant");
    expect(screen.getByTestId("roles").textContent).toContain("tool_call");
    expect(screen.getByTestId("roles").textContent).toContain("tool_result");
  });

  it("supports reload and reset controls", async () => {
    const wasmUrl = await loadTestWasmModule();

    function ControlHarness() {
      const chat = useCodexChat({
        config: {
          transport: createDemoMockTransport(),
          wasmUrl,
          tools: [
            {
              name: "weather_lookup",
              execute: async () => ({
                summary: "Sunny"
              })
            }
          ]
        },
        initialInput: "Plan a Saturday picnic in Limassol."
      });

      return (
        <div>
          <button onClick={() => void chat.sendMessage()}>send</button>
          <button onClick={() => void chat.reload()}>reload</button>
          <button onClick={() => chat.reset()}>reset</button>
          <div data-testid="count">{chat.messages.length}</div>
        </div>
      );
    }

    render(<ControlHarness />);
    screen.getByRole("button", { name: "send" }).click();

    await waitFor(() => {
      expect(Number(screen.getByTestId("count").textContent)).toBeGreaterThan(1);
    });

    screen.getByRole("button", { name: "reload" }).click();
    await waitFor(() => {
      expect(Number(screen.getByTestId("count").textContent)).toBeGreaterThan(1);
    });

    screen.getByRole("button", { name: "reset" }).click();
    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("0");
    });
  });

  it("does not expose empty reasoning messages", async () => {
    cleanup();
    const wasmUrl = await loadTestWasmModule();

    function EmptyReasoningHarness() {
      const chat = useCodexChat({
        config: {
          transport: new MockResponsesTransport(async function* () {
            yield {
              type: "response.output_item.added",
              item: {
                id: "reason_1",
                type: "reasoning",
                summary: []
              }
            };
            yield {
              type: "response.output_item.done",
              item: {
                id: "reason_1",
                type: "reasoning",
                summary: []
              }
            };
            yield {
              type: "response.output_item.added",
              item: {
                id: "msg_1",
                type: "message",
                content: []
              }
            };
            yield {
              type: "response.output_text.delta",
              item_id: "msg_1",
              delta: "hello"
            };
            yield {
              type: "response.output_item.done",
              item: {
                id: "msg_1",
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "hello"
                  }
                ]
              }
            };
            yield {
              type: "response.completed",
              response: {
                id: "resp_1",
                usage: {
                  input_tokens: 1,
                  output_tokens: 1
                }
              }
            };
          }),
          wasmUrl
        },
        initialInput: "hello"
      });

      useEffect(() => {
        void chat.sendMessage();
      }, []);

      return (
        <div data-testid="roles">{chat.messages.map((message) => message.role).join(",")}</div>
      );
    }

    render(<EmptyReasoningHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("roles").textContent).toContain("assistant");
    });

    expect(screen.getByTestId("roles").textContent).not.toContain("reasoning");
  });
});
