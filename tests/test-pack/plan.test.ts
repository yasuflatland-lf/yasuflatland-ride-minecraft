import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Isolation, ScenarioSpec } from "../../src/test-pack/catalog";
import { covers, FEATURE_TAGS } from "../../src/test-pack/features";
import {
  coverageGaps,
  planOf,
  type Skipped,
  shardsOf,
} from "../../src/test-pack/plan";
import { WHOLE_RUN } from "../../src/test-pack/protocol";

const tags = fc.uniqueArray(fc.constantFrom(...FEATURE_TAGS));
const catalog = fc
  .array(
    fc.record({
      ticks: fc.nat({ max: 400 }),
      features: tags,
      needsPlayer: fc.boolean(),
      isolation: fc.constantFrom<Isolation>("lane", "exclusive"),
    }),
    { maxLength: 40 },
  )
  .map((specs): ScenarioSpec[] =>
    specs.map((spec, i) => ({
      ...spec,
      name: `scenario_${i}`,
      file: "fixture",
      vehicles: 0,
    })),
  );
const selectedBy = (
  spec: ScenarioSpec,
  features: readonly (typeof FEATURE_TAGS)[number][],
) =>
  features.some((changed) => spec.features.some((tag) => covers(changed, tag)));

describe("planOf", () => {
  it("runs the catalog unchanged with a player and no feature filter", () => {
    fc.assert(
      fc.property(catalog, (specs) => {
        const plan = planOf(specs, { shard: WHOLE_RUN, playerConnected: true });
        expect(plan.runs).toEqual(specs);
        expect(plan.skipped).toEqual([]);
        expect(plan.unselected).toBe(0);
      }),
    );
  });

  it("skips exactly the selected player scenarios before sharding", () => {
    fc.assert(
      fc.property(
        catalog,
        fc.option(tags, { nil: undefined }),
        fc.integer({ min: 1, max: 8 }),
        (specs, features, total) => {
          const plan = planOf(specs, {
            shard: { index: 1, total },
            playerConnected: false,
            features,
          });
          expect(plan.skipped).toEqual(
            specs
              .filter(
                (spec) =>
                  spec.needsPlayer &&
                  (features === undefined || selectedBy(spec, features)),
              )
              .map(
                ({ name }): Skipped => ({
                  name,
                  reason: "a connected player is required",
                }),
              ),
          );
          expect(plan.runs.every((spec) => !spec.needsPlayer)).toBe(true);
        },
      ),
    );
  });

  it("partitions eligible scenarios once and preserves catalog order in every shard", () => {
    fc.assert(
      fc.property(
        catalog,
        fc.boolean(),
        fc.option(tags, { nil: undefined }),
        fc.integer({ min: 1, max: 8 }),
        (specs, playerConnected, features, total) => {
          const eligible = specs.filter(
            (spec) =>
              (features === undefined || selectedBy(spec, features)) &&
              (playerConnected || !spec.needsPlayer),
          );
          const runs = Array.from({ length: total }, (_, i) => {
            const plan = planOf(specs, {
              shard: { index: i + 1, total },
              playerConnected,
              features,
            });
            expect(plan.expectedTicks).toBe(
              plan.runs.reduce((sum, spec) => sum + spec.ticks, 0),
            );
            return plan.runs;
          });
          const all = runs.flat();
          expect(new Set(all).size).toBe(all.length);
          expect(new Set(all)).toEqual(new Set(eligible));
          for (const run of runs)
            expect(run).toEqual(specs.filter((spec) => run.includes(spec)));
        },
      ),
    );
  });

  it("sums run ticks, filters features, and accounts for the whole catalog", () => {
    fc.assert(
      fc.property(
        catalog,
        fc.boolean(),
        fc.option(tags, { nil: undefined }),
        (specs, playerConnected, features) => {
          const plan = planOf(specs, {
            shard: WHOLE_RUN,
            playerConnected,
            features,
          });
          expect(plan.expectedTicks).toBe(
            plan.runs.reduce((sum, spec) => sum + spec.ticks, 0),
          );
          expect(plan.unselected + plan.skipped.length + plan.runs.length).toBe(
            specs.length,
          );
          if (features !== undefined) {
            expect(plan.runs).toEqual(
              specs.filter(
                (spec) =>
                  selectedBy(spec, features) &&
                  (playerConnected || !spec.needsPlayer),
              ),
            );
            expect(plan.unselected).toBe(
              specs.filter((spec) => !selectedBy(spec, features)).length,
            );
          }
        },
      ),
    );
  });

  it("never removes an eligible run when a feature is added to a whole run", () => {
    fc.assert(
      fc.property(
        catalog,
        tags,
        fc.constantFrom(...FEATURE_TAGS),
        fc.boolean(),
        (specs, features, added, playerConnected) => {
          const options = { shard: WHOLE_RUN, playerConnected };
          const before = planOf(specs, { ...options, features });
          const after = planOf(specs, {
            ...options,
            features: [...features, added],
          });
          expect(before.runs.every((spec) => after.runs.includes(spec))).toBe(
            true,
          );
        },
      ),
    );
  });

  it("preserves the camera verification note when skipping build selection", () => {
    const spec: ScenarioSpec = {
      name: "build_selection_and_mode",
      file: "buildTools",
      ticks: 30,
      features: ["build"],
      isolation: "exclusive",
      needsPlayer: true,
      vehicles: 1,
    };
    expect(
      planOf([spec], { shard: WHOLE_RUN, playerConnected: false }).skipped,
    ).toEqual([
      {
        name: spec.name,
        reason:
          "a connected player is required; camera perspective needs visual verification",
      },
    ]);
  });
});

describe("coverageGaps", () => {
  it("reports exactly the differences between the two name sets", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        fc.array(fc.string()),
        (names, registered) => {
          const gaps = coverageGaps(names, registered);
          expect(new Set(gaps.missing)).toEqual(
            new Set(names.filter((name) => !registered.includes(name))),
          );
          expect(new Set(gaps.extra)).toEqual(
            new Set(registered.filter((name) => !names.includes(name))),
          );
          expect(gaps.missing.length === 0 && gaps.extra.length === 0).toBe(
            names.every((name) => registered.includes(name)) &&
              registered.every((name) => names.includes(name)),
          );
          expect(coverageGaps(names, [...names].reverse())).toEqual({
            missing: [],
            extra: [],
          });
        },
      ),
    );
  });
});

const tickList = fc.array(fc.integer({ min: 1, max: 400 }), { maxLength: 60 });
const shardCount = fc.integer({ min: 1, max: 8 });

function loads(ticks: number[], shards: number[], total: number): number[] {
  return Array.from({ length: total }, (_, k) =>
    ticks.reduce((sum, t, i) => (shards[i] === k + 1 ? sum + t : sum), 0),
  );
}

describe("shardsOf", () => {
  it("puts every test in one shard between 1 and the total", () => {
    fc.assert(
      fc.property(tickList, shardCount, (ticks, total) => {
        const shards = shardsOf(ticks, total);
        expect(shards).toHaveLength(ticks.length);
        for (const s of shards) {
          expect(s).toBeGreaterThanOrEqual(1);
          expect(s).toBeLessThanOrEqual(total);
        }
      }),
    );
  });

  it("keeps the slowest shard within one test of the average", () => {
    fc.assert(
      fc.property(tickList, shardCount, (ticks, total) => {
        const load = loads(ticks, shardsOf(ticks, total), total);
        const sum = ticks.reduce((a, b) => a + b, 0);
        expect(Math.max(...load)).toBeLessThanOrEqual(
          sum / total + Math.max(0, ...ticks),
        );
      }),
    );
  });

  it("splits the same ticks the same way in every job", () => {
    fc.assert(
      fc.property(tickList, shardCount, (ticks, total) => {
        expect(shardsOf(ticks, total)).toEqual(shardsOf([...ticks], total));
      }),
    );
  });

  it("puts everything in the only shard of a whole run", () => {
    fc.assert(
      fc.property(tickList, (ticks) => {
        expect(shardsOf(ticks, 1).every((s) => s === 1)).toBe(true);
      }),
    );
  });
});
