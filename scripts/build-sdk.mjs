import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const packages = [
  {
    dir: path.join(rootDir, "packages", "codex-web-sdk"),
    assetDirs: ["generated/wasm", "generated/upstream-protocol"]
  },
  {
    dir: path.join(rootDir, "packages", "codex-web-sdk-react"),
    assetDirs: []
  },
  {
    dir: path.join(rootDir, "packages", "codex-web-sdk-ui"),
    assetDirs: []
  }
];

for (const pkg of packages) {
  const srcDir = path.join(pkg.dir, "src");
  const distDir = path.join(pkg.dir, "dist");

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await execFileAsync(
    "npx",
    ["tsc", "--project", path.join(pkg.dir, "tsconfig.build.json")],
    { cwd: rootDir }
  );

  for (const assetDir of pkg.assetDirs) {
    if (assetDir === "generated/upstream-protocol") {
      const from = path.join(srcDir, assetDir);
      const to = path.join(distDir, assetDir);
      try {
        await readdir(from);
      } catch {
        continue;
      }

      await execFileAsync(
        "cargo",
        [
          "run",
          "-p",
          "codex-web-sdk-xtask",
          "--",
          "copy-upstream-tree",
          "--src",
          from,
          "--out",
          to
        ],
        { cwd: rootDir }
      );
      continue;
    }

    const from = path.join(srcDir, assetDir);
    try {
      await readdir(from);
      const to = path.join(distDir, assetDir);
      await mkdir(path.dirname(to), { recursive: true });
      await cp(from, to, { recursive: true });
    } catch {
      // Optional generated assets; they may not exist before their build step runs.
    }
  }
}
