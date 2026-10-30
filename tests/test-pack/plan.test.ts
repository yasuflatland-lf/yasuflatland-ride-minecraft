import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPEC } from "../../src/domain/vehicle/spec.ts";
import type { Isolation, ScenarioSpec } from "../../src/test-pack/catalog.ts";
import {
  covers,
  FEATURE_TAGS,
  type FeatureTag,
} from "../../src/test-pack/features.ts";
import type { Skipped } from "../../src/test-pack/plan.ts";
import {
  coverageGaps,
  MAX_LANE_VEHICLES,
  packByTicks,
  planOf,
  shardsOf,
} from "../../src/test-pack/plan.ts";
import { MAX_LANES, WHOLE_RUN } from "../../src/test-pack/protocol.ts";

const tags = fc.uniqueArray(fc.constantFrom(...FEATURE_TAGS));
const catalog = fc
  .array(
    fc.record({
      ticks: fc.nat({ max: 400 }),
      features: tags,
      needsPlayer: fc.boolean(),
      isolation: fc.constantFrom<Isolation>("lane", "exclusive"),
      group: fc.option(fc.constant("tent" as const), { nil: undefined }),
      vehicles: fc.integer({ min: 0, max: 4 }),
    }),
    { maxLength: 40 },
  )
  .map((specs): ScenarioSpec[] =>
    specs.map((spec, i) => ({
      ...spec,
      name: `scenario_${i}`,
      file: "fixture",
    })),
  );
const selectedBy = (spec: ScenarioSpec, features: readonly FeatureTag[]) =>
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

  it("allocates every selected run once within the vehicle and tick budgets", () => {
    fc.assert(
      fc.property(
        catalog,
        fc.integer({ min: 1, max: 8 }),
        fc.boolean(),
        fc.option(tags, { nil: undefined }),
        fc.integer({ min: 1, max: 8 }),
        (specs, requested, playerConnected, features, total) => {
          const options = {
            shard: { index: 1, total },
            playerConnected,
            features,
            lanes: requested,
          };
          const plan = planOf(specs, options);
          expect(planOf([...specs], options)).toEqual(plan);
          const all = [...plan.lanes.flat(), ...plan.exclusive];
          expect(all).toHaveLength(plan.runs.length);
          expect(new Set(all).size).toBe(all.length);
          expect(new Set(all)).toEqual(new Set(plan.runs));
          const laneSpecs = plan.runs.filter(
            (spec) => spec.isolation === "lane",
          );
          const largest = Math.max(
            1,
            ...laneSpecs.map((spec) => spec.vehicles),
          );
          const count = Math.min(
            requested,
            Math.max(1, Math.floor(MAX_LANE_VEHICLES / largest)),
          );
          expect(plan.lanes).toHaveLength(count);
          expect(count * largest).toBeLessThanOrEqual(MAX_LANE_VEHICLES);
          expect(plan.makespanTicks).toBeLessThanOrEqual(plan.expectedTicks);
          if (count === 1) {
            expect(plan.lanes).toEqual([plan.runs]);
            expect(plan.exclusive).toEqual([]);
            expect(plan.makespanTicks).toBe(plan.expectedTicks);
            return;
          }
          expect(plan.exclusive).toEqual(
            plan.runs.filter((spec) => spec.isolation === "exclusive"),
          );
          const grouped = laneSpecs.filter((spec) => spec.group === "tent");
          if (grouped.length > 0) {
            expect(
              plan.lanes.filter((lane) =>
                lane.some((spec) => spec.group === "tent"),
              ),
            ).toHaveLength(1);
            expect(
              plan.lanes.flat().filter((spec) => spec.group === "tent"),
            ).toEqual(grouped);
          }
          const sumTicks = (items: readonly ScenarioSpec[]) =>
            items.reduce((sum, spec) => sum + spec.ticks, 0);
          const maxUnitTicks = Math.max(
            0,
            sumTicks(grouped),
            ...laneSpecs
              .filter((spec) => spec.group === undefined)
              .map((spec) => spec.ticks),
          );
          const bound = Math.ceil(sumTicks(laneSpecs) / count) + maxUnitTicks;
          for (const lane of plan.lanes) {
            expect(lane.every((spec) => spec.isolation === "lane")).toBe(true);
            expect(sumTicks(lane)).toBeLessThanOrEqual(bound);
            const firstMembers = lane.filter(
              (spec) => spec.group === undefined || spec === grouped[0],
            );
            expect(firstMembers).toEqual(
              laneSpecs.filter((spec) => firstMembers.includes(spec)),
            );
            const firstGrouped = grouped[0];
            if (firstGrouped !== undefined && lane.includes(firstGrouped)) {
              const start = lane.indexOf(firstGrouped);
              expect(lane.slice(start, start + grouped.length)).toEqual(
                grouped,
              );
            }
          }
          expect(plan.makespanTicks).toBe(
            Math.max(...plan.lanes.map(sumTicks)) + sumTicks(plan.exclusive),
          );
          expect(plan.makespanTicks).toBeLessThanOrEqual(
            bound + sumTicks(plan.exclusive),
          );
        },
      ),
    );
  });

  it("keeps four requested lanes for one-vehicle lane specs", () => {
    const specs: ScenarioSpec[] = Array.from({ length: 4 }, (_, index) => ({
      name: `scenario_${index}`,
      file: "fixture",
      ticks: 10,
      features: [],
      isolation: "lane",
      needsPlayer: false,
      vehicles: 1,
    }));
    const plan = planOf(specs, {
      shard: WHOLE_RUN,
      playerConnected: true,
      lanes: 4,
    });
    expect(plan.lanes).toHaveLength(4);
  });

  it("reduces eight requested lanes to four for a two-vehicle largest lane spec", () => {
    const specs: ScenarioSpec[] = Array.from({ length: 8 }, (_, index) => ({
      name: `scenario_${index}`,
      file: "fixture",
      ticks: 10,
      features: [],
      isolation: "lane",
      needsPlayer: false,
      vehicles: index === 0 ? 2 : 1,
    }));
    const plan = planOf(specs, {
      shard: WHOLE_RUN,
      playerConnected: true,
      lanes: 8,
    });
    expect(plan.lanes).toHaveLength(4);
  });

  it("orders lane units by their first catalog member and keeps tent members contiguous", () => {
    const specs: ScenarioSpec[] = [2, 4, 9, 3, 4, 6, 1].map((ticks, index) => ({
      name: `scenario_${index}`,
      file: "fixture",
      ticks,
      features: [],
      isolation: "lane",
      group: index === 1 || index === 3 || index === 5 ? "tent" : undefined,
      needsPlayer: false,
      vehicles: 1,
    }));
    const plan = planOf(specs, {
      shard: WHOLE_RUN,
      playerConnected: true,
      lanes: 2,
    });
    expect(plan.lanes.map((lane) => lane.map((spec) => spec.name))).toEqual([
      ["scenario_0", "scenario_1", "scenario_3", "scenario_5"],
      ["scenario_2", "scenario_4", "scenario_6"],
    ]);
  });

  it("keeps the default and explicit single lane identical", () => {
    fc.assert(
      fc.property(catalog, (specs) => {
        const options = { shard: WHOLE_RUN, playerConnected: true };
        const plan = planOf(specs, options);
        expect(planOf(specs, { ...options, lanes: 1 })).toEqual(plan);
        expect(plan.lanes).toEqual([specs]);
        expect(plan.exclusive).toEqual([]);
        expect(plan.makespanTicks).toBe(plan.expectedTicks);
      }),
    );
  });

  it("rejects lane counts outside the supported integers", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.integer({ min: MAX_LANES + 1 }),
          fc.constantFrom(NaN, Infinity, -Infinity, 1.5),
        ),
        (lanes) => {
          expect(() =>
            planOf([], { shard: WHOLE_RUN, playerConnected: true, lanes }),
          ).toThrow(RangeError);
        },
      ),
    );
  });

  it("reserves two vehicle slots below the world eviction cap", () => {
    expect(MAX_LANE_VEHICLES).toBe(SPEC.maxUnownedVehicles - 2);
  });

  it("preserves the camera verification note when skipping build selection", () => {
    const spec: ScenarioSpec = {
      name: "build_selection_and_mode",
      file: "buildTools",
      ticks: 30,
      features: ["build"],
      isolation: "exclusive",
      needsPlayer: true,
      skipNote: "camera perspective needs visual verification",
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
          const uniqueNames = [...new Set(names)];
          expect(coverageGaps(uniqueNames, [...uniqueNames].reverse())).toEqual(
            {
              missing: [],
              extra: [],
              duplicates: [],
            },
          );
        },
      ),
    );
  });
  it("reports names repeated in either list once, including shared duplicates", () => {
    expect(
      coverageGaps(
        ["both", "both", "both", "catalog", "catalog", "shared"],
        ["both", "both", "registry", "registry", "shared"],
      ),
    ).toEqual({
      missing: ["catalog"],
      extra: ["registry"],
      duplicates: ["both", "catalog", "registry"],
    });
  });
});

const tickList = fc.array(fc.integer({ min: 1, max: 400 }), { maxLength: 60 });
const shardCount = fc.integer({ min: 1, max: 8 });

function loads(ticks: number[], shards: number[], total: number): number[] {
  return Array.from({ length: total }, (_, k) =>
    ticks.reduce((sum, t, i) => (shards[i] === k + 1 ? sum + t : sum), 0),
  );
}

describe("packByTicks", () => {
  it("breaks equal tick and load ties by position and bin", () => {
    expect(packByTicks([2, 3, 3, 2, 0], 2)).toEqual([0, 0, 1, 1, 0]);
  });
});

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
