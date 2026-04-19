import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: [
      "packages/codex-web-sdk/test/**/*.test.ts",
      "packages/codex-web-sdk/test/**/*.test.tsx",
      "apps/demo/src/**/*.test.tsx"
    ]
  }
});
