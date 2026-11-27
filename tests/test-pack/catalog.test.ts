import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CATALOG } from "../../src/test-pack/catalog";
import { STALL_MS, TPS } from "../../src/test-pack/deadline";
import { isFeatureTag } from "../../src/test-pack/features";
import { coverageGaps } from "../../src/test-pack/plan";
import {
  NO_ARENA_SCENARIOS,
  SCENARIOS,
} from "../../src/test-pack/scenarios/index";

vi.mock("@minecraft/server", () => ({}));

// A scenario of at most 300 ticks only looks stalled when TPS falls to about 5.
const MAX_SCENARIO_TICKS = ((STALL_MS / 1000) * TPS) / 4;

// Decor setup allows 1,200 ticks (ADR 0244). The night check holds three views for 200 ticks each.
const manualTickBudgets = new Map([
  ["build_structure_decor_probe", 1300],
  ["build_structure_store_decor", 1300],
  ["build_structure_rotation_decor", 1300],
  ["build_paste_structure_decor", 1300],
  ["build_marker_night", 1300],
]);
const longCamperFlights = new Set([
  "camper_boost_release",
  "camper_boost_wall",
  "camper_boost_landing",
]);
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
  it("marks only the nav map scenarios as arena-free", () => {
    expect(
      CATALOG.filter((spec) => spec.needsArena === false).map(
        ({ name }) => name,
      ),
    ).toEqual(["nav_map_delivery", "nav_map_full_inventory"]);
  });

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
    const budget =
      manualTickBudgets.get(spec.name) ??
      (longCamperFlights.has(spec.name) ? 350 : MAX_SCENARIO_TICKS);
    expect(spec.ticks).toBeLessThanOrEqual(budget);
    expect(spec.features.length).toBeGreaterThan(0);
    expect(new Set(spec.features).size).toBe(spec.features.length);
    expect(spec.features.every(isFeatureTag)).toBe(true);
    if (spec.needsPlayer) expect(spec.isolation).toBe("exclusive");
    if (spec.needsArena === false) {
      expect(spec.vehicles).toBe(0);
      expect(spec.isolation).toBe("exclusive");
    }
    expect(spec.manualSetup === true).toBe(manualTickBudgets.has(spec.name));
    if (spec.manualSetup) expect(spec.needsPlayer).toBe(true);
    if (spec.group !== undefined) expect(spec.isolation).toBe("lane");
    expect(existsSync(new URL(`${spec.file}.ts`, scenarios))).toBe(true);
  });

  it("registers exactly the catalog names using functions from their declared files", () => {
    for (const [needsArena, scenarios] of [
      [true, SCENARIOS],
      [false, NO_ARENA_SCENARIOS],
    ] as const) {
      expect(
        coverageGaps(
          CATALOG.filter((spec) => spec.needsArena === needsArena).map(
            (spec) => spec.name,
          ),
          Object.keys(scenarios),
        ),
      ).toEqual({ missing: [], extra: [], duplicates: [] });
    }
    const keys = entries.map((entry) => entry[1] ?? "");
    expect(new Set(keys).size).toBe(keys.length);
    const exceptions: Record<string, { functionName: string; call?: string }> =
      {
        step2_front: { functionName: "step2", call: "step2(a, 8, -90, 100)" },
        step2_diagonal: {
          functionName: "step2",
          call: "step2(a, 30, -60, 100)",
        },
        dutch_oven_simmer_take_back: {
          functionName: "dutchOvenSimmerAndTakeBack",
        },
      };
    for (const spec of CATALOG) {
      const entry = entries.find((entry) => entry[1] === spec.name);
      expect(imports.get(entry?.[2] ?? "")).toBe(spec.file);
      const exception = exceptions[spec.name];
      const camelCase = spec.name.replace(/_([a-z0-9])/g, (_, char: string) =>
        char.toUpperCase(),
      );
      expect(entry?.[2]).toBe(exception?.functionName ?? camelCase);
      if (exception?.call !== undefined)
        expect(entry?.[0]).toContain(exception.call);
    }
  });
});
