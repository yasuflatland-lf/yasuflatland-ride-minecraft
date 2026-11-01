import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../../src/test-pack/catalog";
import {
  covers,
  FEATURE_TAGS,
  isFeatureTag,
} from "../../src/test-pack/features";
import {
  HARNESS_IMPORTS,
  impactOfPath,
  MOTION_TAGS,
  mustRunAll,
  PACK_STEM_TAGS,
  scenarioFileTags,
  selectionOf,
} from "../../src/test-pack/impact";
import { planOf } from "../../src/test-pack/plan";
import { WHOLE_RUN } from "../../src/test-pack/protocol";

const root = new URL("../../", import.meta.url);
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: fileURLToPath(root),
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

function importsOf(path: string): string[] {
  const source = readFileSync(new URL(path, root), "utf8");
  const specifiers = [
    ...source.matchAll(
      /\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["']([^"']+)["']/g,
    ),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
  ];
  return specifiers.flatMap((match) => {
    const specifier = match[1] ?? "";
    if (!specifier.startsWith(".")) return [];
    const base = posix.normalize(posix.join(posix.dirname(path), specifier));
    const resolved = [base, `${base}.ts`, `${base}/index.ts`].find((p) =>
      existsSync(new URL(p, root)),
    );
    expect(resolved, `${path}: ${specifier}`).toBeDefined();
    return resolved?.startsWith("src/") ? [resolved] : [];
  });
}

describe("impact reach", () => {
  it("maps every tracked runtime and tooling path explicitly", () => {
    const paths = tracked.filter((p) =>
      /^(src|packs|scripts|server|tools)\//.test(p),
    );
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => impactOfPath(p).rule === "unmapped")).toEqual(
      [],
    );
  });

  it("lists every tracked pack stem explicitly", () => {
    const paths = tracked.filter((p) =>
      /^packs\/yasu_ride_bp\/[^/]+\/yasu_ride\/|^packs\/yasu_ride_rp\/models\/blocks\//.test(
        p,
      ),
    );
    for (const path of paths) {
      const stem = posix.basename(path).split(".")[0] ?? "";
      expect(Object.hasOwn(PACK_STEM_TAGS, stem), path).toBe(true);
    }
  });

  it("covers the src imports of every scenario file", () => {
    for (const file of tracked.filter(
      (p) =>
        /^src\/test-pack\/scenarios\/[^/]+\.ts$/.test(p) &&
        !/\/(index|shared)\.ts$/.test(p),
    )) {
      const stem = posix.basename(file, ".ts");
      const specs = CATALOG.filter((spec) => spec.file === stem);
      expect(specs.length, file).toBeGreaterThan(0);
      for (const path of importsOf(file)) {
        const selection = selectionOf([path]);
        expect(
          selection.all ||
            specs.some((spec) =>
              spec.features.some((tag) =>
                selection.features.some((changed) => covers(changed, tag)),
              ),
            ),
          `${file}: ${path}`,
        ).toBe(true);
      }
    }
  });

  it("keeps every external harness import in the all list", () => {
    const files = tracked.filter((p) => /^src\/test-pack\/[^/]+\.ts$/.test(p));
    files.push("src/test-pack/scenarios/shared.ts");
    // Include type imports conservatively, just as importsOf does for scenarios.
    const imports = new Set<string>();
    const pending = files.flatMap(importsOf);
    while (pending.length) {
      const path = pending.pop();
      if (!path || path.startsWith("src/test-pack/") || imports.has(path))
        continue;
      imports.add(path);
      pending.push(...importsOf(path));
    }
    expect(new Set(HARNESS_IMPORTS)).toEqual(imports);
    for (const path of HARNESS_IMPORTS)
      expect(impactOfPath(path).impact).toBe("all");
  });

  it("covers the pack string IDs used by every scenario file", () => {
    for (const [file, tags] of Object.entries(scenarioFileTags(CATALOG))) {
      const path = `src/test-pack/scenarios/${file}.ts`;
      const source = readFileSync(new URL(path, root), "utf8");
      const usages = [
        ...source.matchAll(/\bid\s*\(\s*["'`]([a-z0-9_]+)["'`]/g),
        ...source.matchAll(/["'`](?:yasu_ride|yasu_build):([a-z0-9_]+)["'`]/g),
      ];
      for (const stem of new Set(usages.map((match) => match[1] ?? ""))) {
        if (!Object.hasOwn(PACK_STEM_TAGS, stem)) continue;
        const impact = PACK_STEM_TAGS[stem];
        expect(
          impact === "all" ||
            (impact !== undefined &&
              impact !== "none" &&
              impact.some((changed) =>
                tags.some((tag) => covers(changed, tag)),
              )),
          `${path}: ${stem}`,
        ).toBe(true);
      }
    }
  });

  it("covers each kind reaching a motion file through any motion imports", () => {
    const motion = tracked.filter((p) =>
      /^src\/domain\/vehicle\/motion\/[^/]+\.ts$/.test(p),
    );
    const graph = new Map(
      motion.map((p) => [p, importsOf(p).filter((i) => motion.includes(i))]),
    );
    for (const file of tracked.filter((p) =>
      /^src\/domain\/vehicle\/kinds\/[^/]+\/.*\.ts$/.test(p),
    )) {
      const kind = `vehicle:${file.split("/")[4]}`;
      expect(isFeatureTag(kind)).toBe(true);
      if (!isFeatureTag(kind)) continue;
      const pending = importsOf(file).filter((p) => graph.has(p));
      const seen = new Set<string>();
      while (pending.length) {
        const path = pending.pop();
        if (!path || seen.has(path)) continue;
        seen.add(path);
        const tags = MOTION_TAGS[posix.basename(path, ".ts")] ?? ["vehicle"];
        expect(
          tags.some((tag) => covers(tag, kind)),
          `${file}: ${path}`,
        ).toBe(true);
        pending.push(...(graph.get(path) ?? []));
      }
    }
  });
});

const path = fc.constantFrom(
  ...tracked,
  "unknown/future.ts",
  "src/domain/future/x.ts",
);
const paths = fc.array(path, { maxLength: 30 });
const none = fc.constantFrom(
  ...tracked.filter((p) => impactOfPath(p).impact === "none"),
);
const all = fc.constantFrom(
  ...tracked.filter((p) => impactOfPath(p).impact === "all"),
);
const decision = (p: readonly string[]) => {
  const selection = selectionOf(p);
  // The first all path determines the explanation, but not the selected suite.
  return selection.all ? "all" : selection.features;
};

describe("selectionOf", () => {
  it("is order-independent and idempotent under duplicated paths", () => {
    fc.assert(
      fc.property(paths, (p) => {
        expect(decision([...p].reverse())).toEqual(decision(p));
        expect(selectionOf([...p, ...p])).toEqual(selectionOf(p));
        const selection = selectionOf(p);
        if (!selection.all)
          expect(selection.features).toEqual(
            FEATURE_TAGS.filter((t) => selection.features.includes(t)),
          );
      }),
    );
  });

  it("never loses tags or a full run when paths are added", () => {
    fc.assert(
      fc.property(paths, paths, (a, b) => {
        const before = selectionOf(a);
        const after = selectionOf([...a, ...b]);
        if (before.all) expect(after).toEqual(before);
        else if (!after.all)
          expect(before.features.every((t) => after.features.includes(t))).toBe(
            true,
          );
      }),
    );
  });

  it("runs everything for any all path and explains the first one", () => {
    fc.assert(
      fc.property(paths, all, (p, a) => {
        const combined = [...p, a];
        const first = combined.find((p) => impactOfPath(p).impact === "all");
        expect(selectionOf(combined)).toEqual({
          all: true,
          reason: `${first} (${impactOfPath(first ?? "").rule})`,
        });
      }),
    );
  });

  it("ignores none paths", () => {
    fc.assert(
      fc.property(paths, fc.array(none), (p, n) => {
        expect(selectionOf([...n, ...p, ...n])).toEqual(selectionOf(p));
        expect(selectionOf(n)).toEqual({ all: false, features: [] });
      }),
    );
  });

  it("derives file tags as the union of all its scenario tags", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            file: fc.constantFrom("first", "second", "__proto__"),
            features: fc.array(fc.constantFrom(...FEATURE_TAGS)),
          }),
        ),
        (entries) => {
          const specs = entries.map((entry) => ({
            name: "fixture",
            ticks: 0,
            isolation: "lane" as const,
            needsPlayer: false,
            vehicles: 0,
            ...entry,
          }));
          const tags = scenarioFileTags(specs);
          for (const file of new Set(entries.map((e) => e.file))) {
            expect(tags[file]).toEqual(
              FEATURE_TAGS.filter((t) =>
                entries.some((e) => e.file === file && e.features.includes(t)),
              ),
            );
          }
          expect(Object.keys(tags).sort()).toEqual(
            [...new Set(entries.map((e) => e.file))].sort(),
          );
        },
      ),
    );
  });

  it.each([
    ["docs/adr/0001-x.md", "none"],
    ["src/domain/vehicle/kinds/camper/room.ts", "all"],
    ["src/domain/vehicle/motion/pivot.ts", "all"],
    ["src/domain/shared/vec.ts", "all"],
    ["packs/yasu_ride_bp/entities/yasu_ride/tent.se.json", ["camp"]],
  ])("maps %s", (path, impact) => {
    expect(impactOfPath(path).impact).toEqual(impact);
  });

  it("selects camp when its scenario and registry change together", () => {
    expect(
      selectionOf([
        "src/test-pack/scenarios/camp.ts",
        "src/test-pack/catalog.ts",
        "src/test-pack/scenarios/index.ts",
      ]),
    ).toEqual({ all: false, features: ["camp"] });
  });

  it("runs all for a move out of shared", () => {
    expect(
      selectionOf(["src/domain/shared/x.ts", "src/domain/camp/x.ts"]).all,
    ).toBe(true);
  });

  it("selects the road paver no-block scenario for build identifiers", () => {
    const selection = selectionOf(["src/infrastructure/build/identifiers.ts"]);
    expect(selection.all).toBe(false);
    if (selection.all) return;
    expect(
      planOf(CATALOG, {
        shard: WHOLE_RUN,
        playerConnected: false,
        features: selection.features,
      }).runs.map((s) => s.name),
    ).toContain("bulldozer_pave_no_block");
  });

  it.each(["src/test-pack/scenarios/newScenario.ts", "src/new-feature/x.ts"])(
    "falls back conservatively for %s",
    (path) => {
      expect(impactOfPath(path)).toEqual({ impact: "all", rule: "unmapped" });
    },
  );
});

describe("mustRunAll", () => {
  it("requires all for nonempty CI or shard values, or exactly GAME_TEST_ALL=1", () => {
    const value = fc.oneof(
      fc.string(),
      fc.constant(undefined),
      fc.constant(""),
      fc.constant("1"),
    );
    fc.assert(
      fc.property(
        fc.record({ CI: value, GAME_TEST_SHARD: value, GAME_TEST_ALL: value }),
        (env) => {
          const reason = mustRunAll(env);
          expect(reason !== undefined).toBe(
            Boolean(env.CI || env.GAME_TEST_SHARD || env.GAME_TEST_ALL === "1"),
          );
          if (reason !== undefined) expect(reason.length).toBeGreaterThan(0);
        },
      ),
    );
  });
});
