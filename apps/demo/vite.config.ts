import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const demoDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(demoDir, "../..");
const coreSrcEntry = path.resolve(workspaceRoot, "packages/codex-web-sdk/src/index.ts");
const coreNodeSrcEntry = path.resolve(workspaceRoot, "packages/codex-web-sdk/src/node/index.ts");
const reactSrcEntry = path.resolve(workspaceRoot, "packages/codex-web-sdk-react/src/index.ts");
const uiSrcEntry = path.resolve(workspaceRoot, "packages/codex-web-sdk-ui/src/index.ts");

function readApiKey(env: Record<string, string>): string | undefined {
  return (
    env.openai_api_key ||
    env.OPENAI_API_KEY ||
    env.VITE_OPENAI_API_KEY ||
    env.NEXT_PUBLIC_OPENAI_API_KEY
  );
}

export default defineConfig(({ mode }) => {
  const demoEnv = loadEnv(mode, demoDir, "");
  const rootEnv = workspaceRoot === demoDir ? {} : loadEnv(mode, workspaceRoot, "");
  const apiKey = readApiKey(demoEnv) || readApiKey(rootEnv) || process.env.OPENAI_API_KEY;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve(demoDir, "./src")
        },
        {
          find: "@pandelis/codex-web-sdk/node",
          replacement: coreNodeSrcEntry
        },
        {
          find: "@pandelis/codex-web-sdk-react",
          replacement: reactSrcEntry
        },
        {
          find: "@pandelis/codex-web-sdk-ui",
          replacement: uiSrcEntry
        },
        {
          find: "@pandelis/codex-web-sdk",
          replacement: coreSrcEntry
        }
      ]
    },
    server: {
      fs: {
        allow: [workspaceRoot]
      }
    },
    define: {
      "globalThis.__PANDELIS_CODEX_WEB_ENV_CONFIG__": JSON.stringify(
        apiKey
          ? {
              apiKey
            }
          : {}
      )
    }
  };
});
