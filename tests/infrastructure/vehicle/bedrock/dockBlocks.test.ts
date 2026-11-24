import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { cellKey, cellOf } from "../../../../src/domain/shared/cells";
import { asDimensionId, asVehicleId } from "../../../../src/domain/shared/ids";
import type { DockCell } from "../../../../src/domain/vehicle/dock/floor";
import { DOCK_RECHECK_TICKS } from "../../../../src/infrastructure/vehicle/bedrock/dockBlocks";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { defined } from "../../../support/defined";
import {
  createDockBlocks,
  fakeDimension,
  dockFixture as fixture,
} from "../../../support/dockBlocks";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number | boolean>) => ({
      typeId,
      states,
    }),
  },
}));

const cell = fc
  .record({
    x: fc.integer({ min: -3, max: 3 }),
    y: fc.integer({ min: -3, max: 3 }),
    z: fc.integer({ min: -3, max: 3 }),
    block: fc.record({
      type: fc.constant("deck" as const),
      height: fc.integer({ min: 1, max: 16 }),
    }),
  })
  .map((c) => ({ ...c, ...cellOf(c) }));
const cells = fc.uniqueArray(cell, {
  selector: cellKey,
  minLength: 1,
  maxLength: 8,
});

const nextHeight = (c: DockCell): DockCell => ({
  ...c,
  block: {
    type: "deck",
    height: ((c.block.type === "deck" ? c.block.height : 0) % 16) + 1,
  },
});

const deckCells: DockCell[] = [
  { ...cellOf({ x: 0, y: 64, z: 0 }), block: { type: "deck", height: 9 } },
  { ...cellOf({ x: 1, y: 64, z: 0 }), block: { type: "deck", height: 12 } },
];

describe("DockBlocks (ADR 0063)", () => {
  it("persists placed cells, restores them after reload, resizes owned cells and clears them", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = createDockBlocks();
        floors.lay(asVehicleId(f.car.id), f.car, wanted);
        for (const c of wanted)
          expect(f.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            states: {
              [DECK_FLOOR_HEIGHT_STATE]:
                c.block.type === "deck" ? c.block.height : NaN,
            },
          });
        expect(f.savedCells()).toEqual(wanted);
        const resized = wanted.map(nextHeight);
        const reloaded = createDockBlocks();
        reloaded.lay(asVehicleId(f.car.id), f.car, resized);
        for (const c of resized)
          expect(f.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            states: {
              [DECK_FLOOR_HEIGHT_STATE]:
                c.block.type === "deck" ? c.block.height : NaN,
            },
          });
        expect(f.savedCells()).toEqual(resized);
        createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
        for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it("only places in air or light, saves only placed cells and preserves replacement blocks", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = createDockBlocks();
        wanted.forEach((c, i) => {
          f.blocks.set(cellKey(c), {
            typeId:
              [
                "minecraft:air",
                "minecraft:light_block_15",
                "minecraft:water",
                "minecraft:stone",
                DECK_FLOOR_BLOCK,
              ][i % 5] ?? "minecraft:stone",
          });
        });
        const allowed = wanted.filter((_, i) => i % 5 < 2);
        floors.lay(asVehicleId(f.car.id), f.car, wanted);
        expect(f.savedCells()).toEqual(allowed);
        for (const c of allowed)
          f.blocks.set(cellKey(c), { typeId: "minecraft:stone" });
        floors.lay(asVehicleId(f.car.id), f.car, []);
        for (const c of allowed) expect(f.at(c).typeId).toBe("minecraft:stone");
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it("retries unavailable placements and retains unavailable clears for a gone vehicle", () => {
    fc.assert(
      fc.property(
        cells,
        fc.constantFrom("throw", "undefined"),
        (wanted, mode) => {
          const f = fixture();
          const floors = createDockBlocks();
          f.unavailable(mode);
          floors.lay(asVehicleId(f.car.id), f.car, wanted);
          expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
          f.unavailable(undefined);
          floors.lay(asVehicleId(f.car.id), f.car, wanted);
          floors.clearGone(new Set([asVehicleId(f.car.id)]));
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          f.unavailable(mode);
          floors.lay(asVehicleId(f.car.id), undefined, []);
          floors.clearGone(new Set());
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          f.unavailable(undefined);
          floors.clearGone(new Set());
          for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
        },
      ),
    );
  });

  it("retains the old saved height until an unavailable resize succeeds", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = createDockBlocks();
        floors.lay(asVehicleId(f.car.id), f.car, wanted);
        const before = f.saved.get(DECK_CELLS_PROPERTY);
        const resized = wanted.map(nextHeight);
        f.unavailable("throw");
        floors.lay(asVehicleId(f.car.id), f.car, resized);
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(before);
        f.unavailable(undefined);
        floors.lay(asVehicleId(f.car.id), f.car, resized);
        expect(f.savedCells()).toEqual(resized);
      }),
    );
  });

  it("clears the old dimension, not the new one, when the vehicle changes dimension", () => {
    fc.assert(
      fc.property(cells, cells, (wanted, there) => {
        const f = fixture();
        const nether = fakeDimension("nether");
        const floors = createDockBlocks();
        floors.lay(asVehicleId(f.car.id), f.car, wanted);
        for (const c of wanted)
          nether.blocks.set(cellKey(c), { typeId: DECK_FLOOR_BLOCK });
        Object.assign(f.car, { dimension: nether.dimension });
        floors.lay(asVehicleId(f.car.id), f.car, []);
        for (const c of wanted) {
          expect(f.at(c).typeId).toBe("minecraft:air");
          expect(nether.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
        }
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
        // The blocks above belonged to someone else; start from open air.
        nether.blocks.clear();
        floors.lay(asVehicleId(f.car.id), f.car, there);
        for (const c of there)
          expect(nether.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            states: {
              [DECK_FLOOR_HEIGHT_STATE]:
                c.block.type === "deck" ? c.block.height : NaN,
            },
          });
        expect(f.savedCells()).toEqual(there);
      }),
    );
  });

  it("keeps the cells it could not clear in the old dimension and clears them later", () => {
    fc.assert(
      fc.property(
        cells,
        fc.constantFrom("throw" as const, "undefined" as const),
        (wanted, mode) => {
          const f = fixture();
          const nether = fakeDimension("nether");
          const floors = createDockBlocks();
          floors.lay(asVehicleId(f.car.id), f.car, wanted);
          f.unavailable(mode);
          Object.assign(f.car, { dimension: nether.dimension });
          floors.lay(asVehicleId(f.car.id), f.car, []);
          floors.clearGone(new Set([asVehicleId(f.car.id)]));
          expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
          f.unavailable(undefined);
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          floors.clearGone(new Set([asVehicleId(f.car.id)]));
          for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
          expect(nether.blocks.size).toBe(0);
        },
      ),
    );
  });

  it.each(["{", "{}"])("ignores malformed saved floor data: %s", (raw) => {
    const f = fixture();
    const seed = cellOf({ x: 0, y: 64, z: 0 });
    f.blocks.set(cellKey(seed), { typeId: DECK_FLOOR_BLOCK });
    f.saved.set(DECK_CELLS_PROPERTY, raw);
    expect(() =>
      createDockBlocks().lay(asVehicleId(f.car.id), f.car, []),
    ).not.toThrow();
    expect(f.at(seed).typeId).toBe(DECK_FLOOR_BLOCK);
    expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
  });
});

it("clears saved deck cells from the legacy height-only format", () => {
  const f = fixture();
  const c = defined(deckCells[0], "deck cell");
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ x: c.x, y: c.y, z: c.z, height: 9 }]),
  );
  f.blocks.set(cellKey(c), { typeId: DECK_FLOOR_BLOCK });
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(c).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

describe("DockBlocks lost cells (ADR 0096)", () => {
  const id = asVehicleId("car");

  it("lays lost cells again on the check after DOCK_RECHECK_TICKS lays and leaves other blocks alone (ADR 0096)", () => {
    fc.assert(
      fc.property(
        cells,
        fc.array(fc.constantFrom("keep", "air", "light", "stone")),
        (wanted, flags) => {
          const f = fixture();
          const floors = createDockBlocks();
          floors.lay(id, f.car, wanted);
          const flagOf = (i: number) => flags[i] ?? "keep";
          wanted.forEach((c, i) => {
            const key = cellKey(c);
            if (flagOf(i) === "air") f.blocks.delete(key);
            if (flagOf(i) === "light")
              f.blocks.set(key, { typeId: "minecraft:light_block_15" });
            if (flagOf(i) === "stone")
              f.blocks.set(key, { typeId: "minecraft:stone" });
          });
          for (let i = 0; i < DOCK_RECHECK_TICKS - 1; i++)
            floors.lay(id, f.car, wanted);
          wanted.forEach((c, i) => {
            if (flagOf(i) === "air")
              expect(f.at(c).typeId).toBe("minecraft:air");
          });
          floors.lay(id, f.car, wanted);
          wanted.forEach((c, i) => {
            if (flagOf(i) === "stone")
              expect(f.at(c).typeId).toBe("minecraft:stone");
            else
              expect(f.at(c)).toEqual({
                typeId: DECK_FLOOR_BLOCK,
                states: {
                  [DECK_FLOOR_HEIGHT_STATE]:
                    c.block.type === "deck" ? c.block.height : undefined,
                },
              });
          });
          expect(f.savedCells()).toEqual(wanted);
        },
      ),
    );
  });

  it("keeps a laid light, lays it again once lost, and clears only its own light (ADR 0115)", () => {
    const light: DockCell = {
      ...cellOf({ x: 3, y: 66, z: 4 }),
      block: { type: "light" },
    };
    const f = fixture();
    const docks = createDockBlocks();
    docks.lay(id, f.car, [light]);
    expect(f.at(light).typeId).toBe("minecraft:light_block_15");
    expect(f.savedCells()).toEqual([light]);
    f.writes.length = 0;
    for (let i = 0; i < 2 * DOCK_RECHECK_TICKS; i++)
      docks.lay(id, f.car, [light]);
    expect(f.writes).toEqual([]);
    f.blocks.set(cellKey(light), { typeId: "minecraft:light_block_7" });
    for (let i = 0; i < DOCK_RECHECK_TICKS; i++) docks.lay(id, f.car, [light]);
    expect(f.at(light).typeId).toBe("minecraft:light_block_15");
    f.blocks.delete(cellKey(light));
    for (let i = 0; i < DOCK_RECHECK_TICKS; i++) docks.lay(id, f.car, [light]);
    expect(f.at(light).typeId).toBe("minecraft:light_block_15");
    docks.lay(id, f.car, []);
    expect(f.at(light).typeId).toBe("minecraft:air");
    docks.lay(id, f.car, [light]);
    f.blocks.set(cellKey(light), { typeId: "minecraft:torch" });
    docks.lay(id, f.car, []);
    expect(f.at(light).typeId).toBe("minecraft:torch");
  });

  it("reads no block between checks (ADR 0096)", () => {
    const f = fixture();
    const docks = createDockBlocks();
    docks.lay(id, f.car, deckCells);
    const getBlock = vi.spyOn(f.car.dimension, "getBlock");
    for (let i = 0; i < DOCK_RECHECK_TICKS - 1; i++)
      docks.lay(id, f.car, deckCells);
    expect(getBlock).not.toHaveBeenCalled();
    docks.lay(id, f.car, deckCells);
    expect(getBlock).toHaveBeenCalledTimes(deckCells.length);
  });

  it("reads the saved cells on the first lay after a reload (ADR 0096)", () => {
    const f = fixture();
    createDockBlocks().lay(id, f.car, deckCells);
    const floor = defined(deckCells[1], "floor cell");
    f.blocks.delete(cellKey(floor));
    createDockBlocks().lay(id, f.car, deckCells);
    expect(f.at(floor).typeId).toBe(DECK_FLOOR_BLOCK);
  });

  it("skips a lost cell in an unloaded chunk until a later check (ADR 0096)", () => {
    fc.assert(
      fc.property(
        cells,
        fc.constantFrom("throw" as const, "undefined" as const),
        (wanted, mode) => {
          const f = fixture();
          const floors = createDockBlocks();
          floors.lay(id, f.car, wanted);
          for (const c of wanted) f.blocks.delete(cellKey(c));
          f.unavailable(mode);
          for (let i = 0; i < DOCK_RECHECK_TICKS; i++)
            floors.lay(id, f.car, wanted);
          f.unavailable(undefined);
          for (let i = 0; i < DOCK_RECHECK_TICKS - 1; i++)
            floors.lay(id, f.car, wanted);
          for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
          floors.lay(id, f.car, wanted);
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
        },
      ),
    );
  });

  it("does not read the world for a vehicle that is gone or wants no cells (ADR 0096)", () => {
    const f = fixture();
    const docks = createDockBlocks();
    for (let i = 0; i < DOCK_RECHECK_TICKS; i++)
      docks.lay(id, f.car, deckCells);
    // The next lay that wants cells would read every laid cell, and a throwing
    // getBlock keeps the cells laid so each lay below still reaches the guard.
    f.unavailable("throw");
    const getBlock = vi.spyOn(f.car.dimension, "getBlock");
    docks.lay(id, undefined, deckCells);
    docks.lay(id, undefined, []);
    docks.lay(id, f.car, []);
    expect(getBlock).toHaveBeenCalledTimes(3 * deckCells.length);
    docks.lay(id, f.car, deckCells);
    expect(getBlock).toHaveBeenCalledTimes(4 * deckCells.length);
  });

  it("finds the owner of a laid cell only while the world holds the block it laid (ADR 0096)", () => {
    const f = fixture();
    const docks = createDockBlocks();
    docks.lay(id, f.car, deckCells);
    const here = asDimensionId(f.car.dimension.id);
    for (const c of deckCells) {
      expect(docks.laidBlockOwner(here, c, f.at(c).typeId)).toBe(f.car.id);
      expect(docks.laidBlockOwner(here, c, "minecraft:stone")).toBeUndefined();
      expect(
        docks.laidBlockOwner(asDimensionId("nether"), c, f.at(c).typeId),
      ).toBeUndefined();
    }
    expect(
      docks.laidBlockOwner(here, { x: 0, y: 70, z: 0 }, DECK_FLOOR_BLOCK),
    ).toBeUndefined();
    docks.lay(id, f.car, []);
    for (const c of deckCells)
      expect(docks.laidBlockOwner(here, c, f.at(c).typeId)).toBeUndefined();
  });
});

describe("DockBlocks and camp space (ADR 0129)", () => {
  it("keeps cells already held when camp later claims them", () => {
    const f = fixture();
    let claimed = false;
    const docks = createDockBlocks(() => claimed);
    const wanted = [defined(deckCells[0], "deck cell")];
    docks.lay(asVehicleId(f.car.id), f.car, wanted);
    claimed = true;
    docks.lay(asVehicleId(f.car.id), f.car, wanted);
    expect(f.at(defined(wanted[0], "deck cell")).typeId).toBe(DECK_FLOOR_BLOCK);
    expect(f.savedCells()).toEqual(wanted);
    expect(f.writes).toEqual(wanted.map(cellKey));
  });

  it("keeps saved cells after a reload when camp claims them", () => {
    const f = fixture();
    const wanted = [defined(deckCells[0], "deck cell")];
    createDockBlocks().lay(asVehicleId(f.car.id), f.car, wanted);
    const reloaded = createDockBlocks(() => true);
    reloaded.lay(asVehicleId(f.car.id), f.car, wanted);
    expect(f.at(defined(wanted[0], "deck cell")).typeId).toBe(DECK_FLOOR_BLOCK);
    expect(f.savedCells()).toEqual(wanted);
    expect(f.writes).toEqual(wanted.map(cellKey));
  });

  it("drops only claimed cells the vehicle does not hold", () => {
    fc.assert(
      fc.property(
        fc.subarray(deckCells),
        fc.subarray(deckCells),
        (held, claimed) => {
          const f = fixture();
          createDockBlocks().lay(asVehicleId(f.car.id), f.car, held);
          const keys = new Set(claimed.map(cellKey));
          const heldKeys = new Set(held.map(cellKey));
          const docks = createDockBlocks((_, at) => keys.has(cellKey(at)));
          docks.lay(asVehicleId(f.car.id), f.car, deckCells);
          const kept = deckCells.filter(
            (c) => !keys.has(cellKey(c)) || heldKeys.has(cellKey(c)),
          );
          const saved =
            f.saved.get(DECK_CELLS_PROPERTY) === undefined
              ? []
              : f.savedCells();
          expect(new Set(saved.map(cellKey))).toEqual(
            new Set(kept.map(cellKey)),
          );
        },
      ),
    );
  });

  it("asks camp with the vehicle's dimension", () => {
    const f = fixture();
    const check = vi.fn(() => false);
    createDockBlocks(check).lay(asVehicleId(f.car.id), f.car, deckCells);
    for (const c of deckCells)
      expect(check).toHaveBeenCalledWith(asDimensionId(f.car.dimension.id), c);
  });
});
