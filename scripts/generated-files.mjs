import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function generatedStatus() {
  return JSON.parse(
    execFileSync("python3", ["-I", "tools/run_generators.py", "--status"], {
      encoding: "utf8",
    }),
  );
}

export function ensureBuild() {
  const bundles = [
    "packs/yasu_ride_bp/scripts/main.js",
    "packs/yasu_ride_test_bp/scripts/main.js",
  ];
  const inputs = [
    "scripts/build.mjs",
    "scripts/generated-files.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    ".cache/generated/stamp.json",
    ...readdirSync("src", { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name)),
  ];
  const fresh = generatedStatus().fresh;
  const builtAt = Math.min(
    ...bundles.map((path) => (existsSync(path) ? statSync(path).mtimeMs : 0)),
  );
  if (
    !fresh ||
    inputs.some((path) => existsSync(path) && statSync(path).mtimeMs > builtAt)
  ) {
    execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
  }
}
