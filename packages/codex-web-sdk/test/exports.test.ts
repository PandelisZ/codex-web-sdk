import { describe, expect, it } from "vitest";

describe("package export paths", () => {
  it("exposes threads and mcp entrypoints", async () => {
    const threadsModule = await import("../dist/threads.js");
    const mcpModule = await import("../dist/mcp.js");
    const nodeModule = await import("../dist/node/index.js");

    expect(typeof threadsModule.CodexThread).toBe("function");
    expect(typeof threadsModule.Threads).toBe("function");
    expect(typeof mcpModule.createMcpRegistry).toBe("function");
    expect(typeof nodeModule.createNodeRuntimeAdapter).toBe("function");
  });
});
