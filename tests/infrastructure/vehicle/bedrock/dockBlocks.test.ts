import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { DockCell } from "../../../../src/domain/vehicle/floor";
import { type Cell, cellKey } from "../../../../src/domain/vehicle/headlights";
import { DockBlocks } from "../../../../src/infrastructure/vehicle/bedrock/dockBlocks";
import {
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_WALL_BLOCK,
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
  ROOM_FACE_STATE,
  ROOM_OPEN_STATE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { defined } from "../../../support/defined";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number | boolean>) => ({
      typeId,
      states,
    }),
  },
}));

const cell = fc.record({
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
  block: fc.record({
    type: fc.constant("deck" as const),
    height: fc.integer({ min: 1, max: 16 }),
  }),
});
const cells = fc.uniqueArray(cell, {
  selector: cellKey,
  minLength: 1,
  maxLength: 8,
});

type Unavailable = "throw" | "undefined" | undefined;

const nextHeight = (c: DockCell): DockCell => ({
  ...c,
  block: {
    type: "deck",
    height: ((c.block.type === "deck" ? c.block.height : 0) % 16) + 1,
  },
});

// Each dimension has its own blocks, so a test can tell which one was changed.
function fakeDimension(id: string) {
  const blocks = new Map<
    string,
    { typeId: string; states?: Record<string, number | boolean> }
  >();
  let unavailable: Unavailable;
  const at = (c: Cell) => blocks.get(cellKey(c)) ?? { typeId: "minecraft:air" };
  const writes: string[] = [];
  const dimension = {
    id,
    getBlock: (c: DockCell) => {
      if (unavailable === "throw") throw new Error("unloaded");
      if (unavailable === "undefined") return undefined;
      return {
        get typeId() {
          return at(c).typeId;
        },
        get isAir() {
          return at(c).typeId === "minecraft:air";
        },
        setType: (typeId: string) => blocks.set(cellKey(c), { typeId }),
        setPermutation: (p: {
          typeId: string;
          states: Record<string, number | boolean>;
        }) => {
          writes.push(cellKey(c));
          return blocks.set(cellKey(c), {
            typeId: p.typeId,
            states: p.states,
          });
        },
      };
    },
  };
  return {
    dimension,
    writes,
    at,
    blocks,
    unavailable: (mode: Unavailable) => {
      unavailable = mode;
    },
  };
}

function fixture() {
  const overworld = fakeDimension("overworld");
  const saved = new Map<string, unknown>();
  const car = {
    id: "car",
    isValid: true,
    dimension: overworld.dimension,
    getDynamicProperty: (key: string) => saved.get(key),
    setDynamicProperty: (key: string, value: unknown) => saved.set(key, value),
  } as unknown as Entity;
  return {
    car,
    writes: overworld.writes,
    at: overworld.at,
    blocks: overworld.blocks,
    saved,
    savedCells: () => JSON.parse(String(saved.get(DECK_CELLS_PROPERTY))),
    unavailable: overworld.unavailable,
  };
}

describe("DockBlocks (ADR 0063)", () => {
  it("persists placed cells, restores them after reload, resizes owned cells and clears them", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new DockBlocks();
        floors.lay(f.car.id, f.car, wanted);
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
        const reloaded = new DockBlocks();
        reloaded.lay(f.car.id, f.car, resized);
        for (const c of resized)
          expect(f.at(c)).toEqual({
            typeId: DECK_FLOOR_BLOCK,
            states: {
              [DECK_FLOOR_HEIGHT_STATE]:
                c.block.type === "deck" ? c.block.height : NaN,
            },
          });
        expect(f.savedCells()).toEqual(resized);
        new DockBlocks().lay(f.car.id, f.car, []);
        for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it("only places in air or light, saves only placed cells and preserves replacement blocks", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new DockBlocks();
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
        floors.lay(f.car.id, f.car, wanted);
        expect(f.savedCells()).toEqual(allowed);
        for (const c of allowed)
          f.blocks.set(cellKey(c), { typeId: "minecraft:stone" });
        floors.lay(f.car.id, f.car, []);
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
          const floors = new DockBlocks();
          f.unavailable(mode);
          floors.lay(f.car.id, f.car, wanted);
          expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
          f.unavailable(undefined);
          floors.lay(f.car.id, f.car, wanted);
          floors.clearGone(new Set([f.car.id]));
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          f.unavailable(mode);
          floors.lay(f.car.id, undefined, []);
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
        const floors = new DockBlocks();
        floors.lay(f.car.id, f.car, wanted);
        const before = f.saved.get(DECK_CELLS_PROPERTY);
        const resized = wanted.map(nextHeight);
        f.unavailable("throw");
        floors.lay(f.car.id, f.car, resized);
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(before);
        f.unavailable(undefined);
        floors.lay(f.car.id, f.car, resized);
        expect(f.savedCells()).toEqual(resized);
      }),
    );
  });

  it("clears the old dimension, not the new one, when the vehicle changes dimension", () => {
    fc.assert(
      fc.property(cells, cells, (wanted, there) => {
        const f = fixture();
        const nether = fakeDimension("nether");
        const floors = new DockBlocks();
        floors.lay(f.car.id, f.car, wanted);
        for (const c of wanted)
          nether.blocks.set(cellKey(c), { typeId: DECK_FLOOR_BLOCK });
        Object.assign(f.car, { dimension: nether.dimension });
        floors.lay(f.car.id, f.car, []);
        for (const c of wanted) {
          expect(f.at(c).typeId).toBe("minecraft:air");
          expect(nether.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
        }
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
        // The blocks above belonged to someone else; start from open air.
        nether.blocks.clear();
        floors.lay(f.car.id, f.car, there);
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
        fc.constantFrom<Unavailable>("throw", "undefined"),
        (wanted, mode) => {
          const f = fixture();
          const nether = fakeDimension("nether");
          const floors = new DockBlocks();
          floors.lay(f.car.id, f.car, wanted);
          f.unavailable(mode);
          Object.assign(f.car, { dimension: nether.dimension });
          floors.lay(f.car.id, f.car, []);
          floors.clearGone(new Set([f.car.id]));
          expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
          f.unavailable(undefined);
          for (const c of wanted) expect(f.at(c).typeId).toBe(DECK_FLOOR_BLOCK);
          floors.clearGone(new Set([f.car.id]));
          for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
          expect(nether.blocks.size).toBe(0);
        },
      ),
    );
  });

  it.each([
    { raw: "{", seed: { x: 0, y: 64, z: 0 } },
    { raw: "{}", seed: { x: 0, y: 64, z: 0 } },
    {
      raw: '[{"x":0,"y":0,"z":0,"height":17}]',
      seed: { x: 0, y: 0, z: 0 },
    },
    {
      raw: '[{"x":0,"y":0,"z":0,"height":0}]',
      seed: { x: 0, y: 0, z: 0 },
    },
    {
      raw: '[{"x":0.5,"y":0,"z":0,"height":1}]',
      seed: { x: 0.5, y: 0, z: 0 },
    },
  ])("ignores malformed saved floor cells: $raw", ({ raw, seed }) => {
    const f = fixture();
    f.blocks.set(cellKey(seed), { typeId: DECK_FLOOR_BLOCK });
    f.saved.set(DECK_CELLS_PROPERTY, raw);
    expect(() => new DockBlocks().lay(f.car.id, f.car, [])).not.toThrow();
    expect(f.at(seed).typeId).toBe(DECK_FLOOR_BLOCK);
    expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
  });
});

const roomCells: DockCell[] = [
  { x: 0, y: 64, z: 0, block: { type: "deck", height: 9 } },
  { x: 1, y: 64, z: 0, block: { type: "floor" } },
  { x: 2, y: 64, z: 0, block: { type: "ceiling" } },
  { x: 3, y: 64, z: 0, block: { type: "wall", face: 2 } },
  { x: 4, y: 64, z: 0, block: { type: "door", face: 3, open: false } },
];

it("lays every block type with its states and changes only an opened door", () => {
  const f = fixture();
  const docks = new DockBlocks();
  docks.lay(f.car.id, f.car, roomCells);
  expect(roomCells.map(f.at)).toEqual([
    { typeId: DECK_FLOOR_BLOCK, states: { [DECK_FLOOR_HEIGHT_STATE]: 9 } },
    { typeId: CAMPER_FLOOR_BLOCK, states: undefined },
    { typeId: CAMPER_CEILING_BLOCK, states: undefined },
    { typeId: CAMPER_WALL_BLOCK, states: { [ROOM_FACE_STATE]: 2 } },
    {
      typeId: CAMPER_DOOR_BLOCK,
      states: { [ROOM_FACE_STATE]: 3, [ROOM_OPEN_STATE]: false },
    },
  ]);
  f.writes.length = 0;
  const opened = roomCells.map((c) =>
    c.block.type === "door" ? { ...c, block: { ...c.block, open: true } } : c,
  );
  docks.lay(f.car.id, f.car, opened);
  expect(f.writes).toEqual([cellKey(defined(roomCells[4], "door cell"))]);
  expect(f.at(defined(roomCells[4], "door cell")).states).toEqual({
    [ROOM_FACE_STATE]: 3,
    [ROOM_OPEN_STATE]: true,
  });
  new DockBlocks().lay(f.car.id, f.car, []);
  for (const c of roomCells) expect(f.at(c).typeId).toBe("minecraft:air");
});

it.each([
  {
    before: { type: "wall", face: 2 },
    after: { type: "door", face: 3, open: true },
    expected: {
      typeId: CAMPER_DOOR_BLOCK,
      states: { [ROOM_FACE_STATE]: 3, [ROOM_OPEN_STATE]: true },
    },
  },
  {
    before: { type: "deck", height: 9 },
    after: { type: "floor" },
    expected: { typeId: CAMPER_FLOOR_BLOCK, states: undefined },
  },
] as const)(
  "replaces a $before.type cell with a $after.type cell at the same position",
  ({ before, after, expected }) => {
    const f = fixture();
    const docks = new DockBlocks();
    const position = { x: 0, y: 64, z: 0 };
    docks.lay(f.car.id, f.car, [{ ...position, block: before }]);
    const wanted = { ...position, block: after };
    docks.lay(f.car.id, f.car, [wanted]);
    expect(f.at(position)).toEqual(expected);
    expect(f.savedCells()).toEqual([wanted]);
  },
);

it("preserves replacements of wall and door cells", () => {
  const f = fixture();
  const docks = new DockBlocks();
  docks.lay(f.car.id, f.car, roomCells);
  for (const c of roomCells.slice(3))
    f.blocks.set(cellKey(c), { typeId: "minecraft:stone" });
  docks.lay(f.car.id, f.car, []);
  for (const c of roomCells.slice(3))
    expect(f.at(c).typeId).toBe("minecraft:stone");
});

it("clears saved deck cells from the legacy height-only format", () => {
  const f = fixture();
  const c = defined(roomCells[0], "deck cell");
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ x: c.x, y: c.y, z: c.z, height: 9 }]),
  );
  f.blocks.set(cellKey(c), { typeId: DECK_FLOOR_BLOCK });
  new DockBlocks().lay(f.car.id, f.car, []);
  expect(f.at(c).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

it.each([
  { block: { type: "unknown" }, seed: DECK_FLOOR_BLOCK },
  { block: { type: "deck", height: 0 }, seed: DECK_FLOOR_BLOCK },
  { block: { type: "deck", height: 17 }, seed: DECK_FLOOR_BLOCK },
  { block: { type: "deck", height: 1.5 }, seed: DECK_FLOOR_BLOCK },
  { block: { type: "wall", face: -1 }, seed: CAMPER_WALL_BLOCK },
  { block: { type: "wall", face: 4 }, seed: CAMPER_WALL_BLOCK },
  { block: { type: "wall", face: 1.5 }, seed: CAMPER_WALL_BLOCK },
  { block: { type: "door", face: 0, open: "true" }, seed: CAMPER_DOOR_BLOCK },
  { block: { type: "door", face: 4, open: true }, seed: CAMPER_DOOR_BLOCK },
  { block: null, seed: DECK_FLOOR_BLOCK },
])("ignores invalid saved dock blocks: $block", ({ block, seed }) => {
  const f = fixture();
  const position = { x: 0, y: 64, z: 0 };
  const raw = JSON.stringify([{ ...position, block }]);
  f.blocks.set(cellKey(position), { typeId: seed });
  f.saved.set(DECK_CELLS_PROPERTY, raw);
  new DockBlocks().lay(f.car.id, f.car, []);
  expect(f.at(position).typeId).toBe(seed);
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
});

it("finds only the owner of a laid door in the same dimension", () => {
  const f = fixture();
  const docks = new DockBlocks();
  docks.lay(f.car.id, f.car, roomCells);
  for (const c of roomCells) {
    expect(docks.doorOwner(f.car.dimension.id, c)).toBe(
      c.block.type === "door" ? f.car.id : undefined,
    );
    expect(docks.doorOwner("nether", c)).toBeUndefined();
  }
  docks.lay(f.car.id, f.car, []);
  for (const c of roomCells)
    expect(docks.doorOwner(f.car.dimension.id, c)).toBeUndefined();
});
