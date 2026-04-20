import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const packagesDir = path.join(rootDir, "packages");
const HELP_TEXT = `Usage: pnpm release <patch|minor|major|x.y.z> [publish flags...]

Examples:
  pnpm release patch
  pnpm release 0.2.0 --tag next
  pnpm release:patch

Any extra arguments are forwarded to pnpm publish.`;
const BUMP_TYPES = new Set(["patch", "minor", "major"]);

async function main() {
  const [versionArg, ...publishArgs] = process.argv.slice(2);

  if (!versionArg || versionArg === "--help" || versionArg === "-h") {
    console.log(HELP_TEXT);
    process.exit(versionArg ? 0 : 1);
  }

  if (!BUMP_TYPES.has(versionArg) && !isExactVersion(versionArg)) {
    throw new Error(
      `Unsupported version bump "${versionArg}". Use patch, minor, major, or an exact version like 0.2.0.`
    );
  }

  const packages = await loadPublishablePackages();
  if (packages.length === 0) {
    throw new Error("No publishable packages were found under packages/.");
  }

  console.log(`Building workspace before bumping ${packages.length} package(s)...`);
  await run("pnpm", ["build"]);

  const versionPlan = packages.map((pkg) => ({
    ...pkg,
    nextVersion: isExactVersion(versionArg) ? versionArg : bumpVersion(pkg.version, versionArg)
  }));

  console.log("Updating package versions:");
  for (const pkg of versionPlan) {
    console.log(`  ${pkg.name}: ${pkg.version} -> ${pkg.nextVersion}`);
    const nextManifest = {
      ...pkg.manifest,
      version: pkg.nextVersion
    };
    await writeFile(pkg.manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  }

  console.log("Refreshing pnpm lockfile...");
  await run("pnpm", ["install", "--lockfile-only"]);

  console.log("Publishing packages to npm...");
  const publishFilters = versionPlan.flatMap((pkg) => ["--filter", pkg.name]);
  await run("pnpm", [
    "-r",
    ...publishFilters,
    "publish",
    "--access",
    "public",
    "--no-git-checks",
    "--report-summary",
    ...publishArgs
  ]);

  console.log("Release complete.");
}

async function loadPublishablePackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(packagesDir, entry.name, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.private) {
      continue;
    }

    if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
      throw new Error(`Invalid package manifest: ${manifestPath}`);
    }

    packages.push({
      manifest,
      manifestPath,
      name: manifest.name,
      version: manifest.version
    });
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function bumpVersion(currentVersion, bumpType) {
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `Cannot apply a ${bumpType} bump to non-standard version "${currentVersion}". Use an exact version instead.`
    );
  }

  const [major, minor, patch] = match.slice(1).map(Number);
  if (bumpType === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }
  if (bumpType === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major + 1}.0.0`;
}

function isExactVersion(value) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`
        )
      );
    });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
