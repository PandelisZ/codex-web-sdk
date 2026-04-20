import { appendFile } from "node:fs/promises";
import readline from "node:readline";

const lifecycleFile = process.env.STDIO_MCP_LIFECYCLE_FILE;

async function logLifecycle(message) {
  if (!lifecycleFile) {
    return;
  }

  await appendFile(lifecycleFile, `${message}\n`, "utf8");
}

await logLifecycle(`started:${process.pid}`);

process.on("SIGTERM", () => {
  void logLifecycle(`exit:${process.pid}`).finally(() => process.exit(0));
});

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async (line) => {
  if (!line.trim()) {
    return;
  }

  const body = JSON.parse(line);
  let payload;
  if (body.method === "initialize") {
    payload = {
      jsonrpc: "2.0",
      id: body.id,
      result: {}
    };
  } else if (body.method === "tools/list") {
    payload = {
      jsonrpc: "2.0",
      id: body.id,
      result: {
        tools: [
          {
            name: "sum_stdio",
            inputSchema: {
              type: "object"
            }
          }
        ]
      }
    };
  } else {
    payload = {
      jsonrpc: "2.0",
      id: body.id,
      result: {
        sum: 42
      }
    };
  }

  process.stdout.write(`${JSON.stringify(payload)}\n`);
});
