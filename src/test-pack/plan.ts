import type { ScenarioSpec } from "./catalog.ts";
import type { FeatureTag } from "./features.ts";
import { covers } from "./features.ts";
import type { Shard } from "./protocol.ts";
import { MAX_LANES } from "./protocol.ts";

// SPEC.maxUnownedVehicles (10) minus 2 slots of headroom: the cap is per world
// and evicts the oldest vehicle, which could belong to another lane.
export const MAX_LANE_VEHICLES = 8;

/**
 * Ties go to the earlier item and the lower bin so every CI job computes
 * the same split (ADR 0054).
 */
export function packByTicks(ticks: readonly number[], bins: number): number[] {
  const load = new Array<number>(bins).fill(0);
  const shards = new Array<number>(ticks.length);
  const slowestFirst = ticks
    .map((t, position) => ({ t, position }))
    .sort((a, b) => b.t - a.t || a.position - b.position);
  for (const { t, position } of slowestFirst) {
    const lightest = load.indexOf(Math.min(...load));
    load[lightest] = (load[lightest] ?? 0) + t;
    shards[position] = lightest;
  }
  return shards;
}

export function shardsOf(ticks: readonly number[], total: number): number[] {
  return packByTicks(ticks, total).map((bin) => bin + 1);
}

export interface Skipped {
  readonly name: string;
  readonly reason: string;
}

export interface RunPlan {
  readonly runs: readonly ScenarioSpec[];
  readonly skipped: readonly Skipped[];
  readonly unselected: number;
  readonly expectedTicks: number;
  readonly lanes: readonly (readonly ScenarioSpec[])[];
  readonly exclusive: readonly ScenarioSpec[];
  readonly makespanTicks: number;
}

function sumTicks(specs: readonly ScenarioSpec[]): number {
  return specs.reduce((sum, spec) => sum + spec.ticks, 0);
}

function laneCountOf(
  laneSpecs: readonly ScenarioSpec[],
  requested: number,
): number {
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_LANES)
    throw new RangeError(`lanes must be an integer between 1 and ${MAX_LANES}`);
  const largestVehicles = Math.max(
    1,
    ...laneSpecs.map((spec) => spec.vehicles),
  );
  return Math.min(
    requested,
    Math.max(1, Math.floor(MAX_LANE_VEHICLES / largestVehicles)),
  );
}

function packLanes(
  laneSpecs: readonly ScenarioSpec[],
  count: number,
): ScenarioSpec[][] {
  const lanes: ScenarioSpec[][] = Array.from({ length: count }, () => []);
  const units: { members: ScenarioSpec[]; ticks: number }[] = [];
  const groups = new Map<string, (typeof units)[number]>();
  for (const spec of laneSpecs) {
    const existing =
      spec.group === undefined ? undefined : groups.get(spec.group);
    if (existing) {
      existing.members.push(spec);
      existing.ticks += spec.ticks;
    } else {
      const unit = { members: [spec], ticks: spec.ticks };
      units.push(unit);
      if (spec.group !== undefined) groups.set(spec.group, unit);
    }
  }
  const bins = packByTicks(
    units.map((unit) => unit.ticks),
    count,
  );
  for (const [index, unit] of units.entries()) {
    const bin = bins[index];
    if (bin !== undefined) lanes[bin]?.push(...unit.members);
  }
  return lanes;
}

export function planOf(
  catalog: readonly ScenarioSpec[],
  options: {
    readonly shard: Shard;
    readonly playerConnected: boolean;
    readonly features?: readonly FeatureTag[];
    readonly lanes?: number;
  },
): RunPlan {
  const selected = catalog.filter(
    (spec) =>
      options.features === undefined ||
      options.features.some((changed) =>
        spec.features.some((tag) => covers(changed, tag)),
      ),
  );
  const skipped: Skipped[] = [];
  const eligible = selected.filter((spec) => {
    if (options.playerConnected || !spec.needsPlayer) return true;
    skipped.push({
      name: spec.name,
      reason:
        "a connected player is required" +
        (spec.name === "build_selection_and_mode"
          ? "; camera perspective needs visual verification"
          : ""),
    });
    return false;
  });
  const shards = shardsOf(
    eligible.map((spec) => spec.ticks),
    options.shard.total,
  );
  const runs = eligible.filter((_, i) => shards[i] === options.shard.index);
  const laneSpecs = runs.filter((spec) => spec.isolation === "lane");
  const count = laneCountOf(laneSpecs, options.lanes ?? 1);
  const expectedTicks = sumTicks(runs);
  let lanes: ScenarioSpec[][];
  let exclusive: ScenarioSpec[];
  if (count === 1) {
    lanes = [runs];
    exclusive = [];
  } else {
    lanes = packLanes(laneSpecs, count);
    exclusive = runs.filter((spec) => spec.isolation === "exclusive");
  }
  return {
    runs,
    skipped,
    unselected: catalog.length - selected.length,
    expectedTicks,
    lanes,
    exclusive,
    makespanTicks: Math.max(...lanes.map(sumTicks)) + sumTicks(exclusive),
  };
}

export function coverageGaps(
  names: readonly string[],
  registered: readonly string[],
): { readonly missing: string[]; readonly extra: string[] } {
  const expected = new Set(names);
  const actual = new Set(registered);
  return {
    missing: [...expected].filter((name) => !actual.has(name)),
    extra: [...actual].filter((name) => !expected.has(name)),
  };
}
