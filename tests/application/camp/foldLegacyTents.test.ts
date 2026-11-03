import fc from "fast-check";
import { expect, it } from "vitest";
import { FoldLegacyTents } from "../../../src/application/camp/foldLegacyTents";
import type { LegacyTentWorld } from "../../../src/application/camp/ports/legacyTent";
import { TENT_LAYOUT_VERSION } from "../../../src/domain/camp/spec";
import { asTentId, type TentId } from "../../../src/domain/camp/tent";
import {
  parseTents,
  type TentEntry,
} from "../../../src/domain/camp/tentRegistry";
import { asDimensionId } from "../../../src/domain/shared/ids";

class FakeLegacyTentWorld implements LegacyTentWorld {
  readonly blocks = new Map<TentId, readonly string[]>();
  readonly refunds: TentId[] = [];
  readonly unloaded = new Set<TentId>();
  readonly failing = new Set<TentId>();
  readonly attempts: TentId[] = [];

  constructor(public entries: TentEntry[]) {}

  listTents() {
    return [...this.entries];
  }

  foldInto(entry: TentEntry): "folded" | "deferred" {
    this.attempts.push(entry.id);
    if (this.unloaded.has(entry.id)) return "deferred";
    if (this.failing.has(entry.id)) throw new Error("fold failed");
    this.blocks.delete(entry.id);
    this.refunds.push(entry.id);
    this.entries = this.entries.filter((tent) => tent.id !== entry.id);
    return "folded";
  }
}

it("isolates failures, preserves deferred tents, and converges once every legacy tent loads", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          layout: fc.nat({ max: TENT_LAYOUT_VERSION + 1 }),
          loaded: fc.boolean(),
          throws: fc.boolean(),
          blocks: fc.array(fc.string()),
        }),
      ),
      (tents) => {
        const entries = tents.map(
          ({ layout }, index): TentEntry => ({
            id: asTentId(`${index}`),
            layout,
            dimensionId: asDimensionId("minecraft:overworld"),
            pose: { x: index * 50, y: 64, z: -100, yaw: 0 },
          }),
        );
        const world = new FakeLegacyTentWorld(entries);
        for (const [index, tent] of tents.entries()) {
          const id = asTentId(`${index}`);
          world.blocks.set(id, tent.blocks);
          if (!tent.loaded) world.unloaded.add(id);
          if (tent.throws) world.failing.add(id);
        }
        const before = new Map(world.blocks);
        const older = entries.filter((e) => e.layout < TENT_LAYOUT_VERSION);
        const deferred = older.filter(
          (e) => world.unloaded.has(e.id) || world.failing.has(e.id),
        );
        const folded = older.filter((e) => !deferred.includes(e));
        const fold = new FoldLegacyTents(world);
        let pending = -1;
        expect(() => {
          pending = fold.execute();
        }).not.toThrow();
        expect(pending).toBe(deferred.length);
        expect(world.refunds.length + pending).toBe(older.length);
        expect(world.refunds).toEqual(folded.map((e) => e.id));
        expect(world.attempts).toEqual(older.map((e) => e.id));
        expect(world.entries).toEqual(
          entries.filter((e) => !folded.includes(e)),
        );
        for (const entry of world.entries) {
          expect(entry).toEqual(entries.find((e) => e.id === entry.id));
          expect(world.blocks.get(entry.id)).toEqual(before.get(entry.id));
          expect(world.refunds).not.toContain(entry.id);
        }
        expect(fold.execute()).toBe(deferred.length);
        expect(world.refunds).toEqual(folded.map((e) => e.id));

        world.unloaded.clear();
        world.failing.clear();
        expect(fold.execute()).toBe(0);
        expect(world.refunds).toHaveLength(older.length);
        expect(new Set(world.refunds).size).toBe(older.length);
        expect(world.entries).toEqual(
          entries.filter((e) => e.layout >= TENT_LAYOUT_VERSION),
        );
        expect(fold.execute()).toBe(0);
        expect(world.refunds).toHaveLength(older.length);
      },
    ),
  );
});

it("folds unversioned tunnel tents and preserves current and future layouts at the shipped version", () => {
  const pose = { x: 0, y: 64, z: 0, yaw: 0 };
  const world = new FakeLegacyTentWorld(
    parseTents(
      JSON.stringify([
        { id: "legacy", dimensionId: "minecraft:overworld", pose },
        {
          id: "current",
          dimensionId: "minecraft:overworld",
          pose,
          layout: TENT_LAYOUT_VERSION,
        },
        {
          id: "future",
          dimensionId: "minecraft:overworld",
          pose,
          layout: TENT_LAYOUT_VERSION + 1,
        },
      ]),
    ),
  );
  expect(new FoldLegacyTents(world).execute()).toBe(0);
  expect(world.entries.map(({ id }) => id)).toEqual(["current", "future"]);
  expect(world.refunds).toEqual(["legacy"]);
});
