import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../../../src/application/shared/ports/space";
import { type Cell, cellKey } from "../../../../src/domain/shared/cells";
import { asDimensionId, asVehicleId } from "../../../../src/domain/shared/ids";
import type { DockCell } from "../../../../src/domain/vehicle/dock/floor";
import { roomCells as camperRoomCells } from "../../../../src/domain/vehicle/kinds/camper/room";
import {
  DOCK_RECHECK_TICKS,
  DockBlocks,
  savedDock,
} from "../../../../src/infrastructure/vehicle/bedrock/dockBlocks";
import {
  CAMPER_BED_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FRIDGE_DOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_WALL_BLOCK,
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
  PAIR_END_STATES,
  pairDecorBlockId,
  pairEndStates,
  ROOM_FACE_STATE,
  ROOM_LIT_STATE,
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

const noCampSpace: SpaceCheck = () => false;

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
  it("restores and rewrites the exact saved deck_cells of a build before the shared layer", () => {
    const f = fixture();
    const raw =
      '[{"x":0,"y":64,"z":0,"height":5},{"x":1,"y":64,"z":0,"block":{"type":"decor","item":"potted_plant","face":2,"height":3}},{"x":2,"y":64,"z":0,"block":{"type":"door","face":1,"open":true}},{"x":3,"y":65,"z":0,"block":{"type":"light"}},{"x":4,"y":64,"z":0,"block":{"type":"wall","face":7}},"junk"]';
    f.saved.set(DECK_CELLS_PROPERTY, raw);
    const wanted: DockCell[] = [
      { x: 0, y: 64, z: 0, block: { type: "deck", height: 5 } },
      {
        x: 1,
        y: 64,
        z: 0,
        block: {
          type: "decor",
          item: "potted_plant",
          face: 2,
          height: 3,
          spot: 0,
        },
      },
      { x: 2, y: 64, z: 0, block: { type: "door", face: 1, open: true } },
      { x: 3, y: 65, z: 0, block: { type: "light" } },
    ];
    const ids = [
      DECK_FLOOR_BLOCK,
      decorBlockId("potted_plant"),
      CAMPER_DOOR_BLOCK,
      "minecraft:light_block_15",
    ];
    wanted.forEach((c, i) => {
      f.blocks.set(cellKey(c), { typeId: defined(ids[i], "block id") });
    });
    expect(savedDock(f.car)).toEqual({ laid: true, doorOpen: true });
    const floors = new DockBlocks(noCampSpace);
    floors.lay(asVehicleId(f.car.id), f.car, wanted);
    expect(f.writes).toEqual([]);
    expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
    const closed = wanted.map((c) =>
      c.block.type === "door"
        ? { ...c, block: { ...c.block, open: false } }
        : c,
    );
    floors.lay(asVehicleId(f.car.id), f.car, closed);
    expect(f.writes).toEqual(["2,64,0"]);
    expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(
      '[{"x":0,"y":64,"z":0,"block":{"type":"deck","height":5}},{"x":1,"y":64,"z":0,"block":{"type":"decor","item":"potted_plant","face":2,"height":3,"spot":0}},{"x":2,"y":64,"z":0,"block":{"type":"door","face":1,"open":false}},{"x":3,"y":65,"z":0,"block":{"type":"light"}}]',
    );
  });

  it("persists placed cells, restores them after reload, resizes owned cells and clears them", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new DockBlocks(noCampSpace);
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
        const reloaded = new DockBlocks(noCampSpace);
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
        new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
        for (const c of wanted) expect(f.at(c).typeId).toBe("minecraft:air");
        expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
      }),
    );
  });

  it("only places in air or light, saves only placed cells and preserves replacement blocks", () => {
    fc.assert(
      fc.property(cells, (wanted) => {
        const f = fixture();
        const floors = new DockBlocks(noCampSpace);
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
          const floors = new DockBlocks(noCampSpace);
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
        const floors = new DockBlocks(noCampSpace);
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
        const floors = new DockBlocks(noCampSpace);
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
        fc.constantFrom<Unavailable>("throw", "undefined"),
        (wanted, mode) => {
          const f = fixture();
          const nether = fakeDimension("nether");
          const floors = new DockBlocks(noCampSpace);
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
    expect(() =>
      new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []),
    ).not.toThrow();
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
  { x: 5, y: 64, z: 0, block: { type: "bed" } },
  {
    x: 6,
    y: 64,
    z: 0,
    block: {
      type: "decor",
      item: "potted_plant",
      face: 1,
      height: 15,
      spot: 3,
    },
  },
  { x: 7, y: 64, z: 0, block: { type: "furniture", height: 0 } },
  { x: 8, y: 64, z: 0, block: { type: "showerToilet", face: 0 } },
  { x: 9, y: 64, z: 0, block: { type: "cabinetDoor", face: 1 } },
  {
    x: 10,
    y: 64,
    z: 0,
    block: { type: "cabinet", face: 2, open: true, end1: "toaster" },
  },
  { x: 11, y: 64, z: 0, block: { type: "fridgeDoor", face: 0, lit: true } },
  {
    x: 12,
    y: 64,
    z: 0,
    block: {
      type: "fridge",
      face: 1,
      height: 4,
      open: false,
      end0: "mug_pair",
    },
  },
];

it("lays every block type with its states and changes only an opened door", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  docks.lay(asVehicleId(f.car.id), f.car, roomCells);
  expect(roomCells.map(f.at)).toEqual([
    { typeId: DECK_FLOOR_BLOCK, states: { [DECK_FLOOR_HEIGHT_STATE]: 9 } },
    { typeId: CAMPER_FLOOR_BLOCK, states: undefined },
    { typeId: CAMPER_CEILING_BLOCK, states: undefined },
    { typeId: CAMPER_WALL_BLOCK, states: { [ROOM_FACE_STATE]: 2 } },
    {
      typeId: CAMPER_DOOR_BLOCK,
      states: { [ROOM_FACE_STATE]: 3, [ROOM_OPEN_STATE]: false },
    },
    { typeId: CAMPER_BED_BLOCK, states: undefined },
    {
      typeId: decorBlockId("potted_plant"),
      states: {
        [DECOR_FACE_STATE]: 1,
        [DECOR_HEIGHT_STATE]: 15,
        [DECOR_SPOT_STATE]: 3,
      },
    },
    { typeId: CAMPER_FURNITURE_BLOCK, states: { [DECOR_HEIGHT_STATE]: 0 } },
    { typeId: CAMPER_SHOWER_TOILET_BLOCK, states: { [ROOM_FACE_STATE]: 0 } },
    { typeId: CAMPER_CABINET_DOOR_BLOCK, states: { [ROOM_FACE_STATE]: 1 } },
    {
      typeId: pairDecorBlockId("cabinet"),
      states: {
        [DECOR_FACE_STATE]: 2,
        [ROOM_OPEN_STATE]: true,
        ...pairEndStates(0, undefined),
        ...pairEndStates(1, "toaster"),
      },
    },
    {
      typeId: CAMPER_FRIDGE_DOOR_BLOCK,
      states: { [ROOM_FACE_STATE]: 0, [ROOM_LIT_STATE]: true },
    },
    {
      typeId: pairDecorBlockId("fridge"),
      states: {
        [DECOR_FACE_STATE]: 1,
        [DECOR_HEIGHT_STATE]: 4,
        [ROOM_OPEN_STATE]: false,
        ...pairEndStates(0, "mug_pair"),
        ...pairEndStates(1, undefined),
      },
    },
  ]);
  f.writes.length = 0;
  const opened = roomCells.map((c) =>
    c.block.type === "door" ? { ...c, block: { ...c.block, open: true } } : c,
  );
  docks.lay(asVehicleId(f.car.id), f.car, opened);
  expect(f.writes).toEqual([cellKey(defined(roomCells[4], "door cell"))]);
  expect(f.at(defined(roomCells[4], "door cell")).states).toEqual({
    [ROOM_FACE_STATE]: 3,
    [ROOM_OPEN_STATE]: true,
  });
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
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
    const docks = new DockBlocks(noCampSpace);
    const position = { x: 0, y: 64, z: 0 };
    docks.lay(asVehicleId(f.car.id), f.car, [{ ...position, block: before }]);
    const wanted = { ...position, block: after };
    docks.lay(asVehicleId(f.car.id), f.car, [wanted]);
    expect(f.at(position)).toEqual(expected);
    expect(f.savedCells()).toEqual([wanted]);
  },
);

it("preserves replacements of wall, door, bed, decor, furniture, and shower-toilet cells", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  docks.lay(asVehicleId(f.car.id), f.car, roomCells);
  for (const c of roomCells.slice(3))
    f.blocks.set(cellKey(c), { typeId: "minecraft:stone" });
  docks.lay(asVehicleId(f.car.id), f.car, []);
  for (const c of roomCells.slice(3))
    expect(f.at(c).typeId).toBe("minecraft:stone");
});

it("replaces a decor item in place and clears it", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  const position = { x: 0, y: 64, z: 0 };
  const states = {
    [DECOR_FACE_STATE]: 2,
    [DECOR_HEIGHT_STATE]: 7,
    [DECOR_SPOT_STATE]: 0,
  };
  const decorAt = (item: string): DockCell => ({
    ...position,
    block: { type: "decor", item, face: 2, height: 7, spot: 0 },
  });
  docks.lay(asVehicleId(f.car.id), f.car, [decorAt("potted_plant")]);
  expect(f.at(position)).toEqual({
    typeId: decorBlockId("potted_plant"),
    states,
  });
  docks.lay(asVehicleId(f.car.id), f.car, [decorAt("mug_pair")]);
  expect(f.at(position)).toEqual({ typeId: decorBlockId("mug_pair"), states });
  expect(f.savedCells()).toEqual([decorAt("mug_pair")]);
  docks.lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

it("lays both items of a fridge compartment in its one block, each end's code split into page and item states, switches an end in place, and clears it (ADR 0108, 0123)", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  const position = { x: 0, y: 64, z: 0 };
  const pairAt = (end0?: string, end1?: string): DockCell => ({
    ...position,
    block: {
      type: "fridge",
      face: 3,
      height: 3,
      open: true,
      ...(end0 === undefined ? {} : { end0 }),
      ...(end1 === undefined ? {} : { end1 }),
    },
  });
  const [end0, end1] = PAIR_END_STATES;
  // potted_plant is standing item 0 (code 1); desk_fan is standing item 16 (code 17).
  docks.lay(asVehicleId(f.car.id), f.car, [pairAt("potted_plant", "desk_fan")]);
  expect(f.at(position)).toEqual({
    typeId: pairDecorBlockId("fridge"),
    states: {
      [DECOR_FACE_STATE]: 3,
      [DECOR_HEIGHT_STATE]: 3,
      [ROOM_OPEN_STATE]: true,
      [end0.page]: 0,
      [end0.item]: 1,
      [end1.page]: 1,
      [end1.item]: 6,
    },
  });
  docks.lay(asVehicleId(f.car.id), f.car, [pairAt(undefined, "desk_fan")]);
  expect(f.at(position).states).toMatchObject({
    [end0.page]: 0,
    [end0.item]: 0,
  });
  expect(f.savedCells()).toEqual([pairAt(undefined, "desk_fan")]);
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe("minecraft:air");
});

it("lays the table's pair block without a height state, since its one height cannot be a state (ADR 0108)", () => {
  const f = fixture();
  const position = { x: 0, y: 64, z: 0 };
  const [end0, end1] = PAIR_END_STATES;
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, [
    {
      ...position,
      block: {
        type: "decorPair",
        pair: "table",
        face: 1,
        height: 12,
        end0: "potted_plant",
      },
    },
  ]);
  expect(f.at(position)).toEqual({
    typeId: pairDecorBlockId("table"),
    states: {
      [DECOR_FACE_STATE]: 1,
      [end0.page]: 0,
      [end0.item]: 1,
      [end1.page]: 0,
      [end1.item]: 0,
    },
  });
});

it("clears a decor block that an early ADR 0108 build laid at spot 6 (ADR 0108)", () => {
  const f = fixture();
  const position = { x: 0, y: 64, z: 0 };
  f.blocks.set(cellKey(position), { typeId: decorBlockId("toaster") });
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([
      {
        ...position,
        block: { type: "decor", item: "toaster", face: 3, height: 10, spot: 6 },
      },
    ]),
  );
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe("minecraft:air");
});

it("switches a slot between furniture and decor in place and clears it (ADR 0097)", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  const position = { x: 0, y: 64, z: 0 };
  const furniture: DockCell = {
    ...position,
    block: { type: "furniture", height: 12 },
  };
  const decor: DockCell = {
    ...position,
    block: {
      type: "decor",
      item: "potted_plant",
      face: 1,
      height: 12,
      spot: 0,
    },
  };
  const furnitureLaid = {
    typeId: CAMPER_FURNITURE_BLOCK,
    states: { [DECOR_HEIGHT_STATE]: 12 },
  };
  docks.lay(asVehicleId(f.car.id), f.car, [furniture]);
  expect(f.at(position)).toEqual(furnitureLaid);
  expect(f.savedCells()).toEqual([furniture]);
  docks.lay(asVehicleId(f.car.id), f.car, [decor]);
  expect(f.at(position)).toEqual({
    typeId: decorBlockId("potted_plant"),
    states: {
      [DECOR_FACE_STATE]: 1,
      [DECOR_HEIGHT_STATE]: 12,
      [DECOR_SPOT_STATE]: 0,
    },
  });
  expect(f.savedCells()).toEqual([decor]);
  docks.lay(asVehicleId(f.car.id), f.car, [furniture]);
  expect(f.at(position)).toEqual(furnitureLaid);
  expect(f.savedCells()).toEqual([furniture]);
  docks.lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

it("restores a saved bed cell and clears it", () => {
  const f = fixture();
  const cell = { x: 0, y: 64, z: 0 };
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ ...cell, block: { type: "bed" } }]),
  );
  f.blocks.set(cellKey(cell), { typeId: CAMPER_BED_BLOCK });
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(cell).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

it("restores a saved shower-toilet cell with its face and drops one without a valid face (ADR 0098)", () => {
  const cell = { x: 0, y: 64, z: 0 };
  const f = fixture();
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ ...cell, block: { type: "showerToilet", face: 2 } }]),
  );
  f.blocks.set(cellKey(cell), { typeId: CAMPER_SHOWER_TOILET_BLOCK });
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(cell).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
  for (const block of [
    { type: "showerToilet" },
    { type: "showerToilet", face: 4 },
  ]) {
    const g = fixture();
    const raw = JSON.stringify([{ ...cell, block }]);
    g.saved.set(DECK_CELLS_PROPERTY, raw);
    g.blocks.set(cellKey(cell), { typeId: CAMPER_SHOWER_TOILET_BLOCK });
    new DockBlocks(noCampSpace).lay(asVehicleId(g.car.id), g.car, []);
    expect(g.at(cell).typeId).toBe(CAMPER_SHOWER_TOILET_BLOCK);
    expect(g.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
  }
});

it("lays the wall behind the open shower door with its face, swaps it back to the wall, and restores a saved one (ADR 0118)", () => {
  const cell = { x: 0, y: 64, z: 0 };
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  docks.lay(asVehicleId(f.car.id), f.car, [
    { ...cell, block: { type: "showerDoor", face: 1 } },
  ]);
  expect(f.at(cell)).toEqual({
    typeId: CAMPER_SHOWER_DOOR_BLOCK,
    states: { [ROOM_FACE_STATE]: 1 },
  });
  docks.lay(asVehicleId(f.car.id), f.car, [
    { ...cell, block: { type: "wall", face: 1 } },
  ]);
  expect(f.at(cell)).toEqual({
    typeId: CAMPER_WALL_BLOCK,
    states: { [ROOM_FACE_STATE]: 1 },
  });
  const g = fixture();
  g.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ ...cell, block: { type: "showerDoor", face: 3 } }]),
  );
  g.blocks.set(cellKey(cell), { typeId: CAMPER_SHOWER_DOOR_BLOCK });
  new DockBlocks(noCampSpace).lay(asVehicleId(g.car.id), g.car, []);
  expect(g.at(cell).typeId).toBe("minecraft:air");
  const h = fixture();
  const raw = JSON.stringify([
    { ...cell, block: { type: "showerDoor", face: 4 } },
  ]);
  h.saved.set(DECK_CELLS_PROPERTY, raw);
  h.blocks.set(cellKey(cell), { typeId: CAMPER_SHOWER_DOOR_BLOCK });
  new DockBlocks(noCampSpace).lay(asVehicleId(h.car.id), h.car, []);
  expect(h.at(cell).typeId).toBe(CAMPER_SHOWER_DOOR_BLOCK);
  expect(h.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
});

it("clears saved deck cells from the legacy height-only format", () => {
  const f = fixture();
  const c = defined(roomCells[0], "deck cell");
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ x: c.x, y: c.y, z: c.z, height: 9 }]),
  );
  f.blocks.set(cellKey(c), { typeId: DECK_FLOOR_BLOCK });
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(c).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

it("reads a saved decor cell from before the spot state as standing in the cell middle (ADR 0107)", () => {
  const f = fixture();
  const position = { x: 0, y: 64, z: 0 };
  const block = { type: "decor", item: "percolator", face: 2, height: 14 };
  f.saved.set(DECK_CELLS_PROPERTY, JSON.stringify([{ ...position, block }]));
  f.blocks.set(cellKey(position), { typeId: decorBlockId("percolator") });
  const docks = new DockBlocks(noCampSpace);
  const moved: DockCell = {
    ...position,
    block: { type: "decor", item: "percolator", face: 2, height: 15, spot: 1 },
  };
  docks.lay(asVehicleId(f.car.id), f.car, [moved]);
  expect(f.at(position)).toEqual({
    typeId: decorBlockId("percolator"),
    states: {
      [DECOR_FACE_STATE]: 2,
      [DECOR_HEIGHT_STATE]: 15,
      [DECOR_SPOT_STATE]: 1,
    },
  });
  docks.lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe("minecraft:air");
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
  {
    block: { type: "decor", item: "Potted Plant", face: 0, height: 0 },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: { type: "decor", item: 3, face: 0, height: 0 },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: { type: "decor", item: "potted_plant", face: 4, height: 0 },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: { type: "decor", item: "potted_plant", face: 0, height: 16 },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: { type: "decor", item: "potted_plant", face: 0, height: -1 },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: { type: "decor", item: "potted_plant", face: 0, height: 1.5 },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: { type: "decor", item: "potted_plant", face: 0, height: 0, spot: 9 },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: {
      type: "decor",
      item: "potted_plant",
      face: 0,
      height: 0,
      spot: -1,
    },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: {
      type: "decor",
      item: "potted_plant",
      face: 0,
      height: 0,
      spot: 0.5,
    },
    seed: decorBlockId("potted_plant"),
  },
  {
    block: {
      type: "decorPair",
      pair: "bed",
      face: 0,
      height: 4,
      end0: "cushion",
    },
    seed: pairDecorBlockId("shelf"),
  },
  {
    block: {
      type: "decorPair",
      pair: "shelf",
      face: 4,
      height: 4,
      end0: "cushion",
    },
    seed: pairDecorBlockId("shelf"),
  },
  {
    block: {
      type: "decorPair",
      pair: "shelf",
      face: 0,
      height: 16,
      end0: "cushion",
    },
    seed: pairDecorBlockId("shelf"),
  },
  {
    block: { type: "decorPair", pair: "shelf", face: 0, height: 4 },
    seed: pairDecorBlockId("shelf"),
  },
  {
    block: {
      type: "decorPair",
      pair: "table",
      face: 0,
      height: 12,
      end1: "macrame_planter",
    },
    seed: pairDecorBlockId("table"),
  },
  {
    block: { type: "decorPair", pair: "table", face: 0, height: 12, end0: 3 },
    seed: pairDecorBlockId("table"),
  },
  { block: { type: "furniture", height: 16 }, seed: CAMPER_FURNITURE_BLOCK },
  { block: { type: "furniture", height: -1 }, seed: CAMPER_FURNITURE_BLOCK },
  { block: { type: "furniture", height: 1.5 }, seed: CAMPER_FURNITURE_BLOCK },
  { block: { type: "furniture", height: "12" }, seed: CAMPER_FURNITURE_BLOCK },
  { block: null, seed: DECK_FLOOR_BLOCK },
])("ignores invalid saved dock blocks: $block", ({ block, seed }) => {
  const f = fixture();
  const position = { x: 0, y: 64, z: 0 };
  const raw = JSON.stringify([{ ...position, block }]);
  f.blocks.set(cellKey(position), { typeId: seed });
  f.saved.set(DECK_CELLS_PROPERTY, raw);
  new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe(seed);
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
});

it("finds only the owner of a laid door in the same dimension", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  docks.lay(asVehicleId(f.car.id), f.car, roomCells);
  for (const c of roomCells) {
    expect(docks.doorOwner(asDimensionId(f.car.dimension.id), c)).toBe(
      c.block.type === "door" ? f.car.id : undefined,
    );
    expect(docks.doorOwner(asDimensionId("nether"), c)).toBeUndefined();
  }
  docks.lay(asVehicleId(f.car.id), f.car, []);
  for (const c of roomCells)
    expect(
      docks.doorOwner(asDimensionId(f.car.dimension.id), c),
    ).toBeUndefined();
});

it("finds the owner of any laid cell, but of a door only through doorOwner, in the same dimension (ADR 0093)", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  docks.lay(asVehicleId(f.car.id), f.car, roomCells);
  const here = asDimensionId(f.car.dimension.id);
  expect(roomCells.some((c) => c.block.type === "decor")).toBe(true);
  for (const c of roomCells) {
    expect(docks.cellOwner(here, c)).toBe(f.car.id);
    expect(docks.cellOwner(asDimensionId("nether"), c)).toBeUndefined();
  }
  expect(docks.cellOwner(here, { x: 0, y: 70, z: 0 })).toBeUndefined();
  const floor = defined(
    roomCells.find((c) => c.block.type === "floor"),
    "floor cell",
  );
  const door = defined(
    roomCells.find((c) => c.block.type === "door"),
    "door cell",
  );
  expect(docks.doorOwner(here, floor)).toBeUndefined();
  expect(docks.doorOwner(here, door)).toBe(f.car.id);
});

it("finds the owner of a laid furniture cell through cellOwner only (ADR 0097)", () => {
  const f = fixture();
  const docks = new DockBlocks(noCampSpace);
  docks.lay(asVehicleId(f.car.id), f.car, roomCells);
  const here = asDimensionId(f.car.dimension.id);
  const furniture = defined(
    roomCells.find((c) => c.block.type === "furniture"),
    "furniture cell",
  );
  expect(docks.cellOwner(here, furniture)).toBe(f.car.id);
  expect(docks.doorOwner(here, furniture)).toBeUndefined();
});

it("derives laid state and door target from saved dock cells in one property read", () => {
  fc.assert(
    fc.property(fc.boolean(), (open) => {
      const f = fixture();
      const read = vi.spyOn(f.car, "getDynamicProperty");
      expect(savedDock(f.car)).toEqual({ laid: false, doorOpen: undefined });
      for (const raw of ["{", "{}", "[]"]) {
        f.saved.set(DECK_CELLS_PROPERTY, raw);
        expect(savedDock(f.car)).toEqual({ laid: false, doorOpen: undefined });
      }
      f.saved.set(
        DECK_CELLS_PROPERTY,
        JSON.stringify([{ x: 0, y: 64, z: 0, height: 8 }]),
      );
      expect(savedDock(f.car)).toEqual({ laid: true, doorOpen: undefined });
      f.saved.set(
        DECK_CELLS_PROPERTY,
        JSON.stringify(
          roomCells.map((c) =>
            c.block.type === "door" ? { ...c, block: { ...c.block, open } } : c,
          ),
        ),
      );
      read.mockClear();
      expect(savedDock(f.car)).toEqual({ laid: true, doorOpen: open });
      expect(read).toHaveBeenCalledExactlyOnceWith(DECK_CELLS_PROPERTY);
    }),
  );
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
          const floors = new DockBlocks(noCampSpace);
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
    const light: DockCell = { x: 3, y: 66, z: 4, block: { type: "light" } };
    const f = fixture();
    const docks = new DockBlocks(noCampSpace);
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
    const docks = new DockBlocks(noCampSpace);
    docks.lay(id, f.car, roomCells);
    const getBlock = vi.spyOn(f.car.dimension, "getBlock");
    for (let i = 0; i < DOCK_RECHECK_TICKS - 1; i++)
      docks.lay(id, f.car, roomCells);
    expect(getBlock).not.toHaveBeenCalled();
    docks.lay(id, f.car, roomCells);
    expect(getBlock).toHaveBeenCalledTimes(roomCells.length);
  });

  it("reads the saved cells on the first lay after a reload (ADR 0096)", () => {
    const f = fixture();
    new DockBlocks(noCampSpace).lay(id, f.car, roomCells);
    const floor = defined(roomCells[1], "floor cell");
    f.blocks.delete(cellKey(floor));
    new DockBlocks(noCampSpace).lay(id, f.car, roomCells);
    expect(f.at(floor).typeId).toBe(CAMPER_FLOOR_BLOCK);
  });

  it("skips a lost cell in an unloaded chunk until a later check (ADR 0096)", () => {
    fc.assert(
      fc.property(
        cells,
        fc.constantFrom("throw" as const, "undefined" as const),
        (wanted, mode) => {
          const f = fixture();
          const floors = new DockBlocks(noCampSpace);
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
    const docks = new DockBlocks(noCampSpace);
    for (let i = 0; i < DOCK_RECHECK_TICKS; i++)
      docks.lay(id, f.car, roomCells);
    // The next lay that wants cells would read every laid cell, and a throwing
    // getBlock keeps the cells laid so each lay below still reaches the guard.
    f.unavailable("throw");
    const getBlock = vi.spyOn(f.car.dimension, "getBlock");
    docks.lay(id, undefined, roomCells);
    docks.lay(id, undefined, []);
    docks.lay(id, f.car, []);
    expect(getBlock).toHaveBeenCalledTimes(3 * roomCells.length);
    docks.lay(id, f.car, roomCells);
    expect(getBlock).toHaveBeenCalledTimes(4 * roomCells.length);
  });

  it("finds the owner of a laid cell only while the world holds the block it laid (ADR 0096)", () => {
    const f = fixture();
    const docks = new DockBlocks(noCampSpace);
    docks.lay(id, f.car, roomCells);
    const here = asDimensionId(f.car.dimension.id);
    for (const c of roomCells) {
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
    for (const c of roomCells)
      expect(docks.laidBlockOwner(here, c, f.at(c).typeId)).toBeUndefined();
  });
});

it("restores saved storage cells, empty ones too, and a shelf pair block an older build laid, and drops malformed ones (ADR 0108, 0114, 0123)", () => {
  const cell = { x: 0, y: 64, z: 0 };
  for (const [block, typeId] of [
    [
      { type: "fridge", face: 1, height: 3, open: false },
      pairDecorBlockId("fridge"),
    ],
    [{ type: "fridgeDoor", face: 2, lit: false }, CAMPER_FRIDGE_DOOR_BLOCK],
    [
      {
        type: "decorPair",
        pair: "shelf",
        face: 0,
        height: 10,
        end0: "cushion",
      },
      pairDecorBlockId("shelf"),
    ],
    [{ type: "cabinet", face: 3, open: false }, pairDecorBlockId("cabinet")],
    [
      { type: "cabinet", face: 0, open: true, end0: "cushion" },
      pairDecorBlockId("cabinet"),
    ],
    [{ type: "cabinetDoor", face: 2 }, CAMPER_CABINET_DOOR_BLOCK],
  ] as const) {
    const f = fixture();
    f.saved.set(DECK_CELLS_PROPERTY, JSON.stringify([{ ...cell, block }]));
    f.blocks.set(cellKey(cell), { typeId });
    new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, []);
    expect(f.at(cell).typeId).toBe("minecraft:air");
    expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
  }
  for (const block of [
    { type: "cabinet", face: 0 },
    { type: "cabinet", face: 0, open: "yes" },
    { type: "cabinet", face: 0, open: true, end0: "macrame_planter" },
    { type: "cabinetDoor", face: 5 },
    { type: "fridge", face: 0, open: true },
    { type: "fridge", face: 0, height: 3.5, open: true },
    { type: "fridge", face: 0, height: 3, open: 1 },
    { type: "fridgeDoor", face: 0 },
    { type: "fridgeDoor", face: 0, lit: "on" },
  ]) {
    const g = fixture();
    const raw = JSON.stringify([{ ...cell, block }]);
    g.saved.set(DECK_CELLS_PROPERTY, raw);
    g.blocks.set(cellKey(cell), { typeId: CAMPER_CABINET_DOOR_BLOCK });
    new DockBlocks(noCampSpace).lay(asVehicleId(g.car.id), g.car, []);
    expect(g.at(cell).typeId).toBe(CAMPER_CABINET_DOOR_BLOCK);
    expect(g.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
  }
});

describe("DockBlocks and camp space (ADR 0129)", () => {
  const wanted = camperRoomCells({ x: 0, y: 64, z: 0, yaw: 0 }, false);

  it("lays and saves exactly the camper room cells outside camp space", () => {
    fc.assert(
      fc.property(fc.subarray(wanted), (claimed) => {
        const f = fixture();
        const keys = new Set(claimed.map(cellKey));
        for (const c of claimed)
          f.blocks.set(cellKey(c), { typeId: "minecraft:light_block_15" });
        const docks = new DockBlocks((_, at) => keys.has(cellKey(at)));
        docks.lay(asVehicleId(f.car.id), f.car, wanted);
        const allowed = wanted.filter((c) => !keys.has(cellKey(c)));
        expect(f.writes).toEqual(allowed.map(cellKey));
        expect(
          f.saved.get(DECK_CELLS_PROPERTY) === undefined ? [] : f.savedCells(),
        ).toEqual(allowed);
      }),
    );
  });

  it("keeps cells already held when camp later claims them", () => {
    const f = fixture();
    let claimed = false;
    const docks = new DockBlocks(() => claimed);
    const wanted = [defined(roomCells[0], "room cell")];
    docks.lay(asVehicleId(f.car.id), f.car, wanted);
    claimed = true;
    docks.lay(asVehicleId(f.car.id), f.car, wanted);
    expect(f.at(defined(wanted[0], "room cell")).typeId).toBe(DECK_FLOOR_BLOCK);
    expect(f.savedCells()).toEqual(wanted);
    expect(f.writes).toEqual(wanted.map(cellKey));
  });

  it("keeps saved cells after a reload when camp claims them", () => {
    const f = fixture();
    const wanted = [defined(roomCells[0], "room cell")];
    new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, wanted);
    const reloaded = new DockBlocks(() => true);
    reloaded.lay(asVehicleId(f.car.id), f.car, wanted);
    expect(f.at(defined(wanted[0], "room cell")).typeId).toBe(DECK_FLOOR_BLOCK);
    expect(f.savedCells()).toEqual(wanted);
    expect(f.writes).toEqual(wanted.map(cellKey));
  });

  it("drops only claimed cells the vehicle does not hold", () => {
    fc.assert(
      fc.property(
        fc.subarray(roomCells),
        fc.subarray(roomCells),
        (held, claimed) => {
          const f = fixture();
          new DockBlocks(noCampSpace).lay(asVehicleId(f.car.id), f.car, held);
          const keys = new Set(claimed.map(cellKey));
          const heldKeys = new Set(held.map(cellKey));
          const docks = new DockBlocks((_, at) => keys.has(cellKey(at)));
          docks.lay(asVehicleId(f.car.id), f.car, roomCells);
          const kept = roomCells.filter(
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
    new DockBlocks(check).lay(asVehicleId(f.car.id), f.car, roomCells);
    for (const c of roomCells)
      expect(check).toHaveBeenCalledWith(asDimensionId(f.car.dimension.id), c);
  });
});
