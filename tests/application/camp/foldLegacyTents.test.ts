import fc from "fast-check";
import { expect, it } from "vitest";
import { FoldLegacyTents } from "../../../src/application/camp/foldLegacyTents";
import type { LegacyTentWorld } from "../../../src/application/camp/ports/legacyTent";
import { legacyTentClearCells } from "../../../src/domain/camp/legacyTent";
import { asTentId, type TentYaw } from "../../../src/domain/camp/tent";
import type { TentEntry } from "../../../src/domain/camp/tentRegistry";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import {
  asDimensionId,
  type DimensionId,
} from "../../../src/domain/shared/ids";

const key = (dimension: DimensionId, cell: Cell) =>
  `${dimension}:${cellKey(cell)}`;

class FakeLegacyTentWorld implements LegacyTentWorld {
  readonly blocks = new Map<string, string>();
  readonly refunds: string[] = [];
  readonly order: string[] = [];
  constructor(public entries: TentEntry[]) {}
  listTents() {
    return [...this.entries];
  }
  ejectOccupants(entry: TentEntry) {
    this.order.push(`eject:${entry.id}`);
  }
  typeIdAt(dimension: DimensionId, cell: Cell) {
    return this.blocks.get(key(dimension, cell));
  }
  clearTentBlock(dimension: DimensionId, cell: Cell) {
    this.order.push("clear");
    this.blocks.set(key(dimension, cell), "minecraft:air");
  }
  returnTentItem(id: TentEntry["id"], player: undefined) {
    expect(player).toBeUndefined();
    expect(this.entries.some((entry) => entry.id === id)).toBe(true);
    this.order.push(`refund:${id}`);
    this.refunds.push(id);
  }
  removeLegacyTent(entry: TentEntry) {
    this.order.push(`remove:${entry.id}`);
    this.entries = this.entries.filter((tent) => tent.id !== entry.id);
  }
}

const blockId = fc.oneof(
  fc.string(),
  fc.string().map((name) => `yasu_ride:tent_${name}`),
  fc.constantFrom(
    "minecraft:stone",
    "yasu_ride:roof_tent",
    "yasu_ride:tent",
    "other:tent_wall",
  ),
);

it("folds only older tents, preserves every other block, refunds once, and is idempotent", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          layout: fc.nat({ max: 4 }),
          yaw: fc.constantFrom<TentYaw>(0, 90, 180, -90),
        }),
        { maxLength: 4 },
      ),
      fc.array(blockId, { minLength: 336, maxLength: 336 }),
      (tents, types) => {
        const entries = tents.map(
          ({ layout, yaw }, index): TentEntry => ({
            id: asTentId(`${index}`),
            layout,
            dimensionId: asDimensionId(
              index % 2 ? "minecraft:nether" : "minecraft:overworld",
            ),
            pose: { x: index * 50, y: 64, z: -100, yaw },
          }),
        );
        const world = new FakeLegacyTentWorld(entries);
        const cleared = new Set<string>();
        for (const entry of entries) {
          legacyTentClearCells(entry.pose).forEach((cell, index) => {
            const type = types[index] ?? "minecraft:air";
            const at = key(entry.dimensionId, cell);
            world.blocks.set(at, type);
            if (entry.layout < 2 && type.startsWith("yasu_ride:tent_"))
              cleared.add(at);
          });
          world.blocks.set(
            key(entry.dimensionId, { ...entry.pose, y: 68 }),
            "yasu_ride:tent_wall",
          );
        }
        const before = new Map(world.blocks);
        const fold = new FoldLegacyTents(world, 2);
        fold.execute();
        const older = entries.filter((entry) => entry.layout < 2);
        expect(world.entries).toEqual(
          entries.filter((entry) => entry.layout >= 2),
        );
        expect(world.refunds).toEqual(older.map((entry) => entry.id));
        for (const [at, type] of before)
          expect(world.blocks.get(at)).toBe(
            cleared.has(at) ? "minecraft:air" : type,
          );
        for (const entry of older) {
          const start = world.order.indexOf(`eject:${entry.id}`);
          const refund = world.order.indexOf(`refund:${entry.id}`);
          const remove = world.order.indexOf(`remove:${entry.id}`);
          expect(start).toBeLessThan(refund);
          expect(remove).toBe(refund + 1);
          expect(
            world.order
              .slice(start + 1, refund)
              .every((step) => step === "clear"),
          ).toBe(true);
        }
        const after = [...world.order];
        fold.execute();
        expect(world.order).toEqual(after);
        expect(world.refunds).toHaveLength(older.length);
      },
    ),
  );
});

it("keeps existing layout 1 tents at the shipped version", () => {
  const world = new FakeLegacyTentWorld([
    {
      id: asTentId("current"),
      layout: 1,
      dimensionId: asDimensionId("minecraft:overworld"),
      pose: { x: 0, y: 64, z: 0, yaw: 0 },
    },
  ]);
  new FoldLegacyTents(world).execute();
  expect(world.entries).toHaveLength(1);
  expect(world.order).toEqual([]);
});
