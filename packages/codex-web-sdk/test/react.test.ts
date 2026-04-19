import { createElement, useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createDemoMockTransport } from "../src/index";
import { useCodexAgent } from "../src/react";
import { loadTestWasmModule } from "./loadWasm";

function HookHarness({ wasmUrl }: { wasmUrl: Uint8Array }) {
  const { messages, status, submit } = useCodexAgent({
    agentOptions: {
      transport: createDemoMockTransport(),
      wasmUrl
    },
    threadOptions: {
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
    void submit();
  }, []);

  const assistant =
    [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

  return createElement(
    "div",
    null,
    createElement("div", { "data-testid": "status" }, status),
    createElement("div", { "data-testid": "assistant" }, assistant),
    createElement("div", { "data-testid": "message-count" }, String(messages.length))
  );
}

describe("useCodexAgent", () => {
  it("provides an AI SDK-style streaming message state", async () => {
    const wasmUrl = await loadTestWasmModule();
    render(createElement(HookHarness, { wasmUrl }));

    await waitFor(() => {
      expect(screen.getByTestId("assistant").textContent).toContain(
        "The weather looks sunny at 24C, so a seaside picnic should work well."
      );
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("message-count").textContent).toBe("2");
  });
});
