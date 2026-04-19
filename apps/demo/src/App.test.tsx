import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createDemoMockTransport } from "../../../packages/codex-web-sdk/src/index";
import { loadTestWasmModule } from "../../../packages/codex-web-sdk/test/loadWasm";
import { App } from "./App";

describe("App", () => {
  it("renders streaming output from the mock transport", async () => {
    const wasmUrl = await loadTestWasmModule();
    render(
      <App
        wasmUrl={wasmUrl}
        transport={createDemoMockTransport()}
        initialInput="Plan a Saturday picnic in Limassol."
        threadOptions={{
          tools: [
            {
              name: "weather_lookup",
              execute: async (input) => ({
                ...(input as Record<string, unknown>),
                summary: "Sunny, 24C, light sea breeze"
              })
            }
          ]
        }}
      />
    );

    screen.getByRole("button", { name: "Run Turn" }).click();

    await waitFor(() => {
      expect(screen.getByTestId("assistant-output").textContent).toContain(
        "The weather looks sunny at 24C"
      );
    });
  });
});
