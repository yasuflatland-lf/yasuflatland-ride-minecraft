import type { ScenarioSpec } from "./catalog.ts";
import type { FeatureTag } from "./features.ts";
import { covers } from "./features.ts";
import type { Shard } from "./protocol.ts";

/**
 * The 1-based shard of each test, packing the slowest first into the shard
 * with the fewest ticks so far (ADR 0054). Ties go to the earlier test and the
 * lower shard, so every CI job computes the same split.
 */
export function shardsOf(ticks: readonly number[], total: number): number[] {
  const load = new Array<number>(total).fill(0);
  const shards = new Array<number>(ticks.length);
  const slowestFirst = ticks
    .map((t, position) => ({ t, position }))
    .sort((a, b) => b.t - a.t || a.position - b.position);
  for (const { t, position } of slowestFirst) {
    const lightest = load.indexOf(Math.min(...load));
    load[lightest] = (load[lightest] ?? 0) + t;
    shards[position] = lightest + 1;
  }
  return shards;
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
}

function skipReason(spec: ScenarioSpec): string {
  return `a connected player is required${spec.skipNote === undefined ? "" : `; ${spec.skipNote}`}`;
}

export function planOf(
  catalog: readonly ScenarioSpec[],
  options: {
    readonly shard: Shard;
    readonly playerConnected: boolean;
    readonly features?: readonly FeatureTag[];
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
    skipped.push({ name: spec.name, reason: skipReason(spec) });
    return false;
  });
  const shards = shardsOf(
    eligible.map((spec) => spec.ticks),
    options.shard.total,
  );
  const runs = eligible.filter((_, i) => shards[i] === options.shard.index);
  return {
    runs,
    skipped,
    unselected: catalog.length - selected.length,
    expectedTicks: runs.reduce((sum, spec) => sum + spec.ticks, 0),
  };
}

export function coverageGaps(
  names: readonly string[],
  registered: readonly string[],
): {
  readonly missing: string[];
  readonly extra: string[];
  readonly duplicates: string[];
} {
  const expected = new Set(names);
  const actual = new Set(registered);
  const duplicates = new Set<string>();
  for (const list of [names, registered]) {
    const seen = new Set<string>();
    for (const name of list) {
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
    }
  }
  return {
    missing: [...expected].filter((name) => !actual.has(name)),
    extra: [...actual].filter((name) => !expected.has(name)),
    duplicates: [...duplicates],
  };
}
