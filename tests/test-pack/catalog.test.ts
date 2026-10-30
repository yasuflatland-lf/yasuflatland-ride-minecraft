import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../../src/test-pack/catalog";
import { isFeatureTag } from "../../src/test-pack/features";
import { coverageGaps } from "../../src/test-pack/plan";

const scenarios = new URL("../../src/test-pack/scenarios/", import.meta.url);
const registry = readFileSync(new URL("index.ts", scenarios), "utf8");
const entries = [
  ...registry.matchAll(
    /^ {2}([a-z0-9_]+): (?:\(a\) => )?(\w+)(?:\([^\n]*\))?,$/gm,
  ),
];
const imports = new Map<string, string>();
for (const match of registry.matchAll(
  /import\s*\{([^}]+)\}\s*from "\.\/([^"/]+)";/g,
)) {
  for (const name of (match[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean))
    imports.set(name, match[2] ?? "");
}

describe("scenario catalog", () => {
  it("has unique names with the scenario naming convention", () => {
    const names = CATALOG.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9_]+$/);
  });

  it.each(CATALOG)("validates metadata for $name", (spec) => {
    for (const count of [spec.ticks, spec.vehicles]) {
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    expect(spec.features.length).toBeGreaterThan(0);
    expect(new Set(spec.features).size).toBe(spec.features.length);
    expect(spec.features.every(isFeatureTag)).toBe(true);
    if (spec.needsPlayer) expect(spec.isolation).toBe("exclusive");
    if (spec.group !== undefined) expect(spec.isolation).toBe("lane");
    expect(existsSync(new URL(`${spec.file}.ts`, scenarios))).toBe(true);
  });

  it("registers exactly the catalog names using functions from their declared files", () => {
    const keys = entries.map((entry) => entry[1] ?? "");
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      coverageGaps(
        CATALOG.map((spec) => spec.name),
        keys,
      ),
    ).toEqual({ missing: [], extra: [] });
    for (const spec of CATALOG) {
      const entry = entries.find((entry) => entry[1] === spec.name);
      expect(imports.get(entry?.[2] ?? "")).toBe(spec.file);
    }
  });
});
