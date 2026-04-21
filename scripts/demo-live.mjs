import http from "node:http";
import { open as openFile, readFile, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const distDir = path.join(rootDir, "apps", "demo", "dist");

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate port"));
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

async function maybeBuildDemo() {
  const build = spawn("pnpm", ["build"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  const exitCode = await new Promise((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`pnpm build failed with exit code ${exitCode}`);
  }
}

async function serveStaticAsset(filePath, response) {
  const file = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": getContentType(filePath),
    "Cache-Control": filePath.endsWith(".html") ? "no-store" : "public, max-age=31536000, immutable"
  });
  response.end(file);
}

async function serveIndex(response, origin) {
  const indexPath = path.join(distDir, "index.html");
  const html = await readFile(indexPath, "utf8");
  const injected = html.replace(
    "</head>",
    `  <script>window.__PANDELIS_CODEX_WEB_CONFIG__ = ${JSON.stringify({
      baseURL: `${origin}/v1`,
      model: "gpt-5.4",
      initialInput: "Reply with exactly: PANDELIS_CODEX_WEB_OK"
    })};</script>\n</head>`
  );
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(injected);
}

async function handleProxy(request, response, apiKey) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

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
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  await maybeBuildDemo();

  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", origin);
      if (url.pathname === "/v1/responses") {
        await handleProxy(request, response, apiKey);
        return;
      }

      const candidatePath =
        url.pathname === "/" ? path.join(distDir, "index.html") : path.join(distDir, url.pathname);

      if (url.pathname === "/" || url.pathname === "/index.html") {
        await serveIndex(response, origin);
        return;
      }

      const fileInfo = await stat(candidatePath);
      if (fileInfo.isFile()) {
        await serveStaticAsset(candidatePath, response);
        return;
      }

      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      response.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  console.log(`Live demo server: ${origin}`);
  spawn("open", [origin], {
    cwd: rootDir,
    stdio: "ignore",
    detached: true
  }).unref();

  const shutdown = async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
