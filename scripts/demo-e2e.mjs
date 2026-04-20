import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const demoDir = path.join(rootDir, "apps", "demo");
const outputDir = path.join(rootDir, "output", "playwright");
const screenshotPath = path.join(outputDir, "demo-e2e.png");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate a preview port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForServer(url, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`vite preview exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`timed out waiting for preview server at ${url}: ${String(lastError)}`);
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    request.on("error", reject);
  });
}

async function startProxyServer(apiKey) {
  const port = await getFreePort();
  let requestCount = 0;
  const server = http.createServer(async (request, response) => {
    setCorsHeaders(response);

    if (!request.url) {
      response.writeHead(400);
      response.end("Missing request URL");
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    try {
      requestCount += 1;
      const body = await readRequestBody(request);
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${apiKey}`
        },
        body
      });

      response.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store"
      });

      if (!upstream.body) {
        response.end();
        return;
      }

      await new Promise((resolve, reject) => {
        Readable.fromWeb(upstream.body).pipe(response);
        response.on("finish", resolve);
        response.on("error", reject);
      });
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    getRequestCount() {
      return requestCount;
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for pnpm test:e2e");
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const proxy = await startProxyServer(apiKey);
  await mkdir(outputDir, { recursive: true });

  const preview = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: demoDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    }
  );

  let previewStdout = "";
  let previewStderr = "";
  let pageConsole = [];
  let pageErrors = [];
  let lastAssistantOutput = "";
  let lastEventLog = "";
  preview.stdout.on("data", (chunk) => {
    previewStdout += chunk.toString();
  });
  preview.stderr.on("data", (chunk) => {
    previewStderr += chunk.toString();
  });

  try {
    await waitForServer(baseUrl, preview);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on("console", (message) => {
        pageConsole.push(`[${message.type()}] ${message.text()}`);
      });
      page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
      });
      await page.addInitScript((config) => {
        window.__PANDELIS_CODEX_WEB_CONFIG__ = config;
      }, {
        baseUrl: proxy.baseUrl,
        model: "gpt-5.1-codex",
        initialInput: "Reply with exactly the text PANDELIS_CODEX_WEB_OK and nothing else."
      });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Run Turn" }).click();

      await page.waitForFunction(() => {
        const element = document.querySelector('[data-testid="assistant-output"]');
        return element?.textContent?.includes("PANDELIS_CODEX_WEB_OK");
      });
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-testid="event-log"]');
        const text = element?.textContent ?? "";
        return text.includes("turn.completed") && text.includes("agent_message");
      });

      const assistantOutput = await page.getByTestId("assistant-output").textContent();
      lastAssistantOutput = assistantOutput ?? "";
      assert.ok(
        assistantOutput?.includes("PANDELIS_CODEX_WEB_OK"),
        `unexpected assistant output: ${assistantOutput}`
      );

      const eventLog = await page.getByTestId("event-log").textContent();
      lastEventLog = eventLog ?? "";
      assert.ok(eventLog?.includes("turn.completed"), "turn completion was not rendered");
      assert.ok(eventLog?.includes("agent_message"), "agent completion item was not rendered");

      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`E2E demo check passed: ${screenshotPath}`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    throw new Error(
      `demo E2E verification failed.\nstdout:\n${previewStdout}\nstderr:\n${previewStderr}\nproxy requests: ${proxy.getRequestCount()}\npage console:\n${pageConsole.join("\n")}\npage errors:\n${pageErrors.join("\n")}\nassistant output:\n${lastAssistantOutput}\nevent log:\n${lastEventLog}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`
    );
  } finally {
    await stopChild(preview);
    await proxy.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
