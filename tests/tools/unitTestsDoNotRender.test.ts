import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const self = resolve(fileURLToPath(import.meta.url));
const tests = resolve(dirname(self), "..");

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && path.endsWith(".ts") && path !== self
      ? [path]
      : [];
  });
}

describe("unit tests do not render every preview", () => {
  it("keeps full preview rendering out of every TypeScript test file", () => {
    const offenders = typescriptFiles(tests).filter((path) => {
      const source = readFileSync(path, "utf8");
      return ["render_camping_gear(", "raster_jobs(", "rasterize_all("].some(
        (entryPoint) => source.includes(entryPoint),
      );
    });
    expect(
      offenders,
      `Full preview rendering found in: ${offenders.map((path) => relative(dirname(tests), path)).join(", ")}`,
    ).toEqual([]);
  });
});
