import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { FoldLegacyTents } from "../../../src/application/camp/foldLegacyTents";
import type { LegacyTentWorld } from "../../../src/application/camp/ports/legacyTent";
import {
  legacyTentClearCells,
  legacyTentExit,
} from "../../../src/domain/camp/legacyTent";
import { TENT_LAYOUT_VERSION } from "../../../src/domain/camp/spec";
import { asTentId, type TentId } from "../../../src/domain/camp/tent";
import {
  parseTents,
  type TentEntry,
} from "../../../src/domain/camp/tentRegistry";
import type { Cell } from "../../../src/domain/shared/cells";
import { snapYaw } from "../../../src/domain/shared/facing";
import {
  asDimensionId,
  type DimensionId,
  type PlayerId,
} from "../../../src/domain/shared/ids";

class FakeLegacyTentWorld implements LegacyTentWorld {
  readonly refunds: TentId[] = [];
  readonly unloaded = new Set<TentId>();
  readonly failing = new Set<TentId>();
  readonly attempts: TentId[] = [];

  constructor(public entries: TentEntry[]) {}

  listTents() {
    return [...this.entries];
  }

  anchorLoaded = vi.fn((entry: TentEntry): boolean => {
    this.attempts.push(entry.id);
    return !this.unloaded.has(entry.id);
  });

  ejectPlayers = vi.fn(
    (_dimensionId: DimensionId, _cells: readonly Cell[], _exit: Cell) => {},
  );

  returnTentItem = vi.fn((tentId: TentId, _playerId: PlayerId | undefined) => {
    if (this.failing.has(tentId)) throw new Error("fold failed");
    this.refunds.push(tentId);
  });

  entityLoaded = vi.fn((_tentId: TentId) => true);
  unlayBlocks = vi.fn((_tentId: TentId) => {});
  clearBlocksByPose = vi.fn((_tentId: TentId) => {});
  clearTentBlocks = vi.fn(
    (_dimensionId: DimensionId, _cells: readonly Cell[]) => {},
  );

  removeTent = vi.fn((tentId: TentId) => {
    this.entries = this.entries.filter((tent) => tent.id !== tentId);
  });
}

it("isolates failures, preserves deferred tents, and converges once every legacy tent loads", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          layout: fc.nat({ max: TENT_LAYOUT_VERSION + 1 }),
          loaded: fc.boolean(),
          throws: fc.boolean(),
        }),
      ),
      (tents) => {
        const entries = tents.map(
          ({ layout }, index): TentEntry => ({
            id: asTentId(`${index}`),
            layout,
            dimensionId: asDimensionId("minecraft:overworld"),
            pose: { x: index * 50, y: 64, z: -100, yaw: snapYaw(0) },
          }),
        );
        const world = new FakeLegacyTentWorld(entries);
        for (const [index, tent] of tents.entries()) {
          const id = asTentId(`${index}`);
          if (!tent.loaded) world.unloaded.add(id);
          if (tent.throws) world.failing.add(id);
        }
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

it("folds unversioned tunnel and version-2 trapezoid tents and preserves current and future layouts at the shipped version", () => {
  const pose = { x: 0, y: 64, z: 0, yaw: snapYaw(0) };
  const world = new FakeLegacyTentWorld(
    parseTents(
      JSON.stringify([
        { id: "legacy", dimensionId: "minecraft:overworld", pose },
        {
          id: "trapezoid",
          dimensionId: "minecraft:overworld",
          pose,
          layout: 2,
        },
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
  expect(world.refunds).toEqual(["legacy", "trapezoid"]);
});

it.each([false, true])(
  "folds a loaded legacy tent and defers an unloaded one (loaded %s)",
  (loaded) => {
    const entry: TentEntry = {
      id: asTentId("legacy"),
      layout: 1,
      dimensionId: asDimensionId("minecraft:overworld"),
      pose: { x: 10, y: 64, z: -20, yaw: snapYaw(90) },
    };
    const world = new FakeLegacyTentWorld([entry]);
    if (!loaded) world.unloaded.add(entry.id);

    expect(new FoldLegacyTents(world).execute()).toBe(loaded ? 0 : 1);
    expect(world.anchorLoaded).toHaveBeenCalledExactlyOnceWith(entry);
    expect(world.clearBlocksByPose).not.toHaveBeenCalled();

    const steps = [
      world.ejectPlayers,
      world.returnTentItem,
      world.entityLoaded,
      world.unlayBlocks,
      world.clearTentBlocks,
      world.removeTent,
    ];
    if (!loaded) {
      for (const step of steps) expect(step).not.toHaveBeenCalled();
      return;
    }

    const cells = legacyTentClearCells(entry.pose);
    expect(world.ejectPlayers).toHaveBeenCalledExactlyOnceWith(
      entry.dimensionId,
      cells,
      legacyTentExit(entry.pose),
    );
    expect(world.returnTentItem).toHaveBeenCalledExactlyOnceWith(
      entry.id,
      undefined,
    );
    expect(world.entityLoaded).toHaveBeenCalledExactlyOnceWith(entry.id);
    expect(world.unlayBlocks).toHaveBeenCalledExactlyOnceWith(entry.id);
    expect(world.clearTentBlocks).toHaveBeenCalledExactlyOnceWith(
      entry.dimensionId,
      cells,
    );
    expect(world.removeTent).toHaveBeenCalledExactlyOnceWith(entry.id);
    expect(world.ejectPlayers).toHaveBeenCalledBefore(world.unlayBlocks);
    expect(world.ejectPlayers).toHaveBeenCalledBefore(world.clearTentBlocks);
    expect(world.returnTentItem).toHaveBeenCalledBefore(world.removeTent);
  },
);
