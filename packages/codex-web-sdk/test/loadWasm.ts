import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function loadTestWasmModule(): Promise<Buffer> {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  return await readFile(
    path.resolve(testDir, "../src/generated/wasm/codex_web_sdk_wasm_bg.wasm")
  );
}
