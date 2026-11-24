import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { cellKey, cellOf } from "../../../../../src/domain/shared/cells";
import {
  asDimensionId,
  asVehicleId,
} from "../../../../../src/domain/shared/ids";
import type { DockCell } from "../../../../../src/domain/vehicle/dock/floor";
import { STANDING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import { roomCells as camperRoomCells } from "../../../../../src/domain/vehicle/kinds/camper/roomCells";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
} from "../../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { savedDock } from "../../../../../src/infrastructure/vehicle/kinds/camper/dockBlocks";
import {
  CAMPER_BED_BLOCK,
  CAMPER_BUNK_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FRIDGE_DOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_WALL_BLOCK,
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
  drawerBlockStates,
  PAIR_END_STATES,
  PAIR_PAGE_SIZE,
  pairDecorBlockId,
  pairEndStates,
  ROOM_FACE_STATE,
  ROOM_LIT_STATE,
  ROOM_OPEN_STATE,
} from "../../../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import { decorItemId } from "../../../../support/decorIds";
import { defined } from "../../../../support/defined";
import {
  createDockBlocks,
  dockCodec,
  dockFixture as fixture,
} from "../../../../support/dockBlocks";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number | boolean>) => ({
      typeId,
      states,
    }),
  },
}));

it("restores and rewrites the exact saved deck_cells of a build before the shared layer", () => {
  const f = fixture();
  const raw =
    '[{"x":0,"y":64,"z":0,"height":5},{"x":1,"y":64,"z":0,"block":{"type":"decor","item":"potted_plant","face":2,"height":3}},{"x":2,"y":64,"z":0,"block":{"type":"door","face":1,"open":true}},{"x":3,"y":65,"z":0,"block":{"type":"light"}},{"x":4,"y":64,"z":0,"block":{"type":"wall","face":7}},"junk"]';
  f.saved.set(DECK_CELLS_PROPERTY, raw);
  const wanted: DockCell[] = [
    { ...cellOf({ x: 0, y: 64, z: 0 }), block: { type: "deck", height: 5 } },
    {
      ...cellOf({ x: 1, y: 64, z: 0 }),
      block: {
        type: "decor",
        item: decorItemId("potted_plant"),
        face: 2,
        height: 3,
        spot: 0,
      },
    },
    {
      ...cellOf({ x: 2, y: 64, z: 0 }),
      block: { type: "door", face: 1, open: true },
    },
    { ...cellOf({ x: 3, y: 65, z: 0 }), block: { type: "light" } },
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
  expect(savedDock(f.car, dockCodec)).toEqual({ laid: true, doorOpen: true });
  const floors = createDockBlocks();
  floors.lay(asVehicleId(f.car.id), f.car, wanted);
  expect(f.writes).toEqual([]);
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
  const closed = wanted.map((c) =>
    c.block.type === "door" ? { ...c, block: { ...c.block, open: false } } : c,
  );
  floors.lay(asVehicleId(f.car.id), f.car, closed);
  expect(f.writes).toEqual(["2,64,0"]);
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(
    '[{"x":0,"y":64,"z":0,"block":{"type":"deck","height":5}},{"x":1,"y":64,"z":0,"block":{"type":"decor","item":"potted_plant","face":2,"height":3,"spot":0}},{"x":2,"y":64,"z":0,"block":{"type":"door","face":1,"open":false}},{"x":3,"y":65,"z":0,"block":{"type":"light"}}]',
  );
});

it("restores and clears saved dashboard decor spots", () => {
  const f = fixture();
  const saved = [9, 10].map((spot, x) => ({
    x,
    y: 64,
    z: 0,
    block: { type: "decor", item: "potted_plant", face: 0, height: 3, spot },
  }));
  f.saved.set(DECK_CELLS_PROPERTY, JSON.stringify(saved));
  for (const c of saved)
    f.blocks.set(cellKey(cellOf(c)), { typeId: decorBlockId("potted_plant") });
  expect(savedDock(f.car, dockCodec).laid).toBe(true);
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
  for (const c of saved) expect(f.at(cellOf(c)).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

const roomCells: DockCell[] = [
  { ...cellOf({ x: 0, y: 64, z: 0 }), block: { type: "deck", height: 9 } },
  { ...cellOf({ x: 1, y: 64, z: 0 }), block: { type: "floor" } },
  { ...cellOf({ x: 2, y: 64, z: 0 }), block: { type: "ceiling" } },
  { ...cellOf({ x: 3, y: 64, z: 0 }), block: { type: "wall", face: 2 } },
  {
    ...cellOf({ x: 4, y: 64, z: 0 }),
    block: { type: "door", face: 3, open: false },
  },
  { ...cellOf({ x: 5, y: 64, z: 0 }), block: { type: "bed" } },
  {
    ...cellOf({ x: 6, y: 64, z: 0 }),
    block: {
      type: "decor",
      item: decorItemId("potted_plant"),
      face: 1,
      height: 15,
      spot: 3,
    },
  },
  { ...cellOf({ x: 7, y: 64, z: 0 }), block: { type: "furniture", height: 0 } },
  {
    ...cellOf({ x: 8, y: 64, z: 0 }),
    block: { type: "showerToilet", face: 0 },
  },
  { ...cellOf({ x: 9, y: 64, z: 0 }), block: { type: "cabinetDoor", face: 1 } },
  {
    ...cellOf({ x: 10, y: 64, z: 0 }),
    block: {
      type: "cabinet",
      face: 2,
      open: true,
      end1: decorItemId("toaster"),
    },
  },
  {
    ...cellOf({ x: 11, y: 64, z: 0 }),
    block: { type: "fridgeDoor", face: 0, lit: true },
  },
  {
    ...cellOf({ x: 12, y: 64, z: 0 }),
    block: {
      type: "fridge",
      face: 1,
      height: 4,
      open: false,
      end0: decorItemId("mug_pair"),
    },
  },
  { ...cellOf({ x: 13, y: 64, z: 0 }), block: { type: "bunk" } },
];

it("lays every block type with its states and changes only an opened door", () => {
  const f = fixture();
  const docks = createDockBlocks();
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
    { typeId: CAMPER_BUNK_BLOCK, states: undefined },
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
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
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
    const docks = createDockBlocks();
    const position = cellOf({ x: 0, y: 64, z: 0 });
    docks.lay(asVehicleId(f.car.id), f.car, [{ ...position, block: before }]);
    const wanted = { ...position, block: after };
    docks.lay(asVehicleId(f.car.id), f.car, [wanted]);
    expect(f.at(position)).toEqual(expected);
    expect(f.savedCells()).toEqual([wanted]);
  },
);

it("preserves replacements of wall, door, bed, decor, furniture, and shower-toilet cells", () => {
  const f = fixture();
  const docks = createDockBlocks();
  docks.lay(asVehicleId(f.car.id), f.car, roomCells);
  for (const c of roomCells.slice(3))
    f.blocks.set(cellKey(c), { typeId: "minecraft:stone" });
  docks.lay(asVehicleId(f.car.id), f.car, []);
  for (const c of roomCells.slice(3))
    expect(f.at(c).typeId).toBe("minecraft:stone");
});

it("replaces a decor item in place and clears it", () => {
  const f = fixture();
  const docks = createDockBlocks();
  const position = cellOf({ x: 0, y: 64, z: 0 });
  const states = {
    [DECOR_FACE_STATE]: 2,
    [DECOR_HEIGHT_STATE]: 7,
    [DECOR_SPOT_STATE]: 0,
  };
  const decorAt = (item: string): DockCell => ({
    ...position,
    block: {
      type: "decor",
      item: decorItemId(item),
      face: 2,
      height: 7,
      spot: 0,
    },
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
  const docks = createDockBlocks();
  const position = cellOf({ x: 0, y: 64, z: 0 });
  const pairAt = (end0?: string, end1?: string): DockCell => ({
    ...position,
    block: {
      type: "fridge",
      face: 3,
      height: 3,
      open: true,
      ...(end0 === undefined ? {} : { end0: decorItemId(end0) }),
      ...(end1 === undefined ? {} : { end1: decorItemId(end1) }),
    },
  });
  const [end0, end1] = PAIR_END_STATES;
  const first = defined(STANDING_GEAR_IDS[0], "first standing gear");
  const last = defined(
    STANDING_GEAR_IDS[STANDING_GEAR_IDS.length - 1],
    "last standing gear",
  );
  const firstCode = 1;
  const lastCode = STANDING_GEAR_IDS.length;
  docks.lay(asVehicleId(f.car.id), f.car, [pairAt(first, last)]);
  expect(f.at(position)).toEqual({
    typeId: pairDecorBlockId("fridge"),
    states: {
      [DECOR_FACE_STATE]: 3,
      [DECOR_HEIGHT_STATE]: 3,
      [ROOM_OPEN_STATE]: true,
      [end0.page]: Math.floor(firstCode / PAIR_PAGE_SIZE),
      [end0.item]: firstCode % PAIR_PAGE_SIZE,
      [end1.page]: Math.floor(lastCode / PAIR_PAGE_SIZE),
      [end1.item]: lastCode % PAIR_PAGE_SIZE,
    },
  });
  docks.lay(asVehicleId(f.car.id), f.car, [pairAt(undefined, last)]);
  expect(f.at(position).states).toMatchObject({
    [end0.page]: 0,
    [end0.item]: 0,
  });
  expect(f.savedCells()).toEqual([pairAt(undefined, last)]);
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe("minecraft:air");
});

it("lays the table's pair block without a height state, since its one height cannot be a state (ADR 0108)", () => {
  const f = fixture();
  const position = cellOf({ x: 0, y: 64, z: 0 });
  const [end0, end1] = PAIR_END_STATES;
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, [
    {
      ...position,
      block: {
        type: "decorPair",
        pair: "table",
        face: 1,
        height: 12,
        end0: decorItemId("potted_plant"),
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
  const position = cellOf({ x: 0, y: 64, z: 0 });
  f.blocks.set(cellKey(position), { typeId: decorBlockId("toaster") });
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([
      {
        ...position,
        block: {
          type: "decor",
          item: decorItemId("toaster"),
          face: 3,
          height: 10,
          spot: 6,
        },
      },
    ]),
  );
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(position).typeId).toBe("minecraft:air");
});

it("switches a slot between furniture and decor in place and clears it (ADR 0097)", () => {
  const f = fixture();
  const docks = createDockBlocks();
  const position = cellOf({ x: 0, y: 64, z: 0 });
  const furniture: DockCell = {
    ...position,
    block: { type: "furniture", height: 12 },
  };
  const decor: DockCell = {
    ...position,
    block: {
      type: "decor",
      item: decorItemId("potted_plant"),
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
  const cell = cellOf({ x: 0, y: 64, z: 0 });
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ ...cell, block: { type: "bed" } }]),
  );
  f.blocks.set(cellKey(cell), { typeId: CAMPER_BED_BLOCK });
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
  expect(f.at(cell).typeId).toBe("minecraft:air");
  expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
});

it("restores a saved shower-toilet cell with its face and drops one without a valid face (ADR 0098)", () => {
  const cell = cellOf({ x: 0, y: 64, z: 0 });
  const f = fixture();
  f.saved.set(
    DECK_CELLS_PROPERTY,
    JSON.stringify([{ ...cell, block: { type: "showerToilet", face: 2 } }]),
  );
  f.blocks.set(cellKey(cell), { typeId: CAMPER_SHOWER_TOILET_BLOCK });
  createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
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
    createDockBlocks().lay(asVehicleId(g.car.id), g.car, []);
    expect(g.at(cell).typeId).toBe(CAMPER_SHOWER_TOILET_BLOCK);
    expect(g.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
  }
});

it("lays the wall behind the open shower door with its face, swaps it back to the wall, and restores a saved one (ADR 0118)", () => {
  const cell = cellOf({ x: 0, y: 64, z: 0 });
  const f = fixture();
  const docks = createDockBlocks();
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
  createDockBlocks().lay(asVehicleId(g.car.id), g.car, []);
  expect(g.at(cell).typeId).toBe("minecraft:air");
  const h = fixture();
  const raw = JSON.stringify([
    { ...cell, block: { type: "showerDoor", face: 4 } },
  ]);
  h.saved.set(DECK_CELLS_PROPERTY, raw);
  h.blocks.set(cellKey(cell), { typeId: CAMPER_SHOWER_DOOR_BLOCK });
  createDockBlocks().lay(asVehicleId(h.car.id), h.car, []);
  expect(h.at(cell).typeId).toBe(CAMPER_SHOWER_DOOR_BLOCK);
  expect(h.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
});

it("reads a saved decor cell from before the spot state as standing in the cell middle (ADR 0107)", () => {
  const f = fixture();
  const position = cellOf({ x: 0, y: 64, z: 0 });
  const block = {
    type: "decor",
    item: decorItemId("percolator"),
    face: 2,
    height: 14,
  };
  f.saved.set(DECK_CELLS_PROPERTY, JSON.stringify([{ ...position, block }]));
  f.blocks.set(cellKey(position), { typeId: decorBlockId("percolator") });
  const docks = createDockBlocks();
  const moved: DockCell = {
    ...position,
    block: {
      type: "decor",
      item: decorItemId("percolator"),
      face: 2,
      height: 15,
      spot: 1,
    },
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

it("ignores saved cells with a generated invalid field", () => {
  const invalidFace = fc.constantFrom(-1, 4, 1.5);
  const invalidHeight = fc.constantFrom(-1, 16, 1.5, "12");
  const decor = {
    type: "decor",
    item: decorItemId("potted_plant"),
    face: 0,
    height: 0,
    spot: 0,
  };
  const pair = {
    type: "decorPair",
    pair: "shelf",
    face: 0,
    height: 4,
    end0: decorItemId("cushion"),
  };
  const changed = (
    block: object,
    seed: string,
    field: string,
    values: fc.Arbitrary<unknown>,
  ) =>
    values.map((value) => ({
      cell: { x: 0, y: 64, z: 0, block: { ...block, [field]: value } },
      seed,
    }));
  const invalid = fc.oneof(
    changed(
      { type: "deck", height: 1 },
      DECK_FLOOR_BLOCK,
      "height",
      fc.constantFrom(0, 17, 1.5),
    ),
    changed({ type: "wall", face: 0 }, CAMPER_WALL_BLOCK, "face", invalidFace),
    changed(
      { type: "door", face: 0, open: true },
      CAMPER_DOOR_BLOCK,
      "face",
      invalidFace,
    ),
    changed(
      { type: "door", face: 0, open: true },
      CAMPER_DOOR_BLOCK,
      "open",
      fc.constant("true"),
    ),
    changed(
      decor,
      decorBlockId("potted_plant"),
      "item",
      fc.constantFrom(decorItemId("Potted Plant"), 3),
    ),
    changed(decor, decorBlockId("potted_plant"), "face", invalidFace),
    changed(decor, decorBlockId("potted_plant"), "height", invalidHeight),
    changed(
      decor,
      decorBlockId("potted_plant"),
      "spot",
      fc.constantFrom(-1, 11, 0.5),
    ),
    changed(pair, pairDecorBlockId("shelf"), "pair", fc.constant("bed")),
    changed(pair, pairDecorBlockId("shelf"), "face", invalidFace),
    changed(pair, pairDecorBlockId("shelf"), "height", invalidHeight),
    changed(
      pair,
      pairDecorBlockId("shelf"),
      "end0",
      fc.constantFrom(undefined, 3, decorItemId("macrame_planter")),
    ),
    changed(
      { type: "furniture", height: 0 },
      CAMPER_FURNITURE_BLOCK,
      "height",
      invalidHeight,
    ),
    fc.constantFrom(
      { cell: { x: 0, y: 64, z: 0, block: null }, seed: DECK_FLOOR_BLOCK },
      {
        cell: { x: 0, y: 64, z: 0, block: { type: "unknown" } },
        seed: DECK_FLOOR_BLOCK,
      },
      ...[0, 17].map((height) => ({
        cell: { x: 0, y: 64, z: 0, height },
        seed: DECK_FLOOR_BLOCK,
      })),
      { cell: { x: 0.5, y: 64, z: 0, height: 1 }, seed: DECK_FLOOR_BLOCK },
    ),
  );
  fc.assert(
    fc.property(invalid, ({ cell, seed }) => {
      const f = fixture();
      const raw = JSON.stringify([cell]);
      f.blocks.set(cellKey(cellOf(cell)), { typeId: seed });
      f.saved.set(DECK_CELLS_PROPERTY, raw);
      createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
      expect(f.at(cellOf(cell)).typeId).toBe(seed);
      expect(f.saved.get(DECK_CELLS_PROPERTY)).toBe(raw);
    }),
    { numRuns: 1000 },
  );
});

it("finds only the owner of a laid door in the same dimension", () => {
  const f = fixture();
  const docks = createDockBlocks();
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
  const docks = createDockBlocks();
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
  const docks = createDockBlocks();
  docks.lay(asVehicleId(f.car.id), f.car, roomCells);
  const here = asDimensionId(f.car.dimension.id);
  const furniture = defined(
    roomCells.find((c) => c.block.type === "furniture"),
    "furniture cell",
  );
  expect(docks.cellOwner(here, furniture)).toBe(f.car.id);
  expect(docks.doorOwner(here, furniture)).toBeUndefined();
});

it.each([true, false])(
  "derives laid state and door target in one property read when open is %s",
  (open) => {
    const f = fixture();
    const read = vi.spyOn(f.car, "getDynamicProperty");
    expect(savedDock(f.car, dockCodec)).toEqual({
      laid: false,
      doorOpen: undefined,
    });
    for (const raw of ["{", "{}", "[]"]) {
      f.saved.set(DECK_CELLS_PROPERTY, raw);
      expect(savedDock(f.car, dockCodec)).toEqual({
        laid: false,
        doorOpen: undefined,
      });
    }
    f.saved.set(
      DECK_CELLS_PROPERTY,
      JSON.stringify([{ x: 0, y: 64, z: 0, height: 8 }]),
    );
    expect(savedDock(f.car, dockCodec)).toEqual({
      laid: true,
      doorOpen: undefined,
    });
    f.saved.set(
      DECK_CELLS_PROPERTY,
      JSON.stringify(
        roomCells.map((c) =>
          c.block.type === "door" ? { ...c, block: { ...c.block, open } } : c,
        ),
      ),
    );
    read.mockClear();
    expect(savedDock(f.car, dockCodec)).toEqual({ laid: true, doorOpen: open });
    expect(read).toHaveBeenCalledExactlyOnceWith(DECK_CELLS_PROPERTY);
  },
);

it("restores saved storage cells, empty ones too, and a shelf pair block an older build laid, and drops malformed ones (ADR 0108, 0114, 0123)", () => {
  const cell = cellOf({ x: 0, y: 64, z: 0 });
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
        end0: decorItemId("cushion"),
      },
      pairDecorBlockId("shelf"),
    ],
    [{ type: "cabinet", face: 3, open: false }, pairDecorBlockId("cabinet")],
    [
      { type: "cabinet", face: 0, open: true, end0: decorItemId("cushion") },
      pairDecorBlockId("cabinet"),
    ],
    [{ type: "cabinetDoor", face: 2 }, CAMPER_CABINET_DOOR_BLOCK],
  ] as const) {
    const f = fixture();
    f.saved.set(DECK_CELLS_PROPERTY, JSON.stringify([{ ...cell, block }]));
    f.blocks.set(cellKey(cell), { typeId });
    createDockBlocks().lay(asVehicleId(f.car.id), f.car, []);
    expect(f.at(cell).typeId).toBe("minecraft:air");
    expect(f.saved.get(DECK_CELLS_PROPERTY)).toBeUndefined();
  }
  for (const block of [
    { type: "cabinet", face: 0 },
    { type: "cabinet", face: 0, open: "yes" },
    {
      type: "cabinet",
      face: 0,
      open: true,
      end0: decorItemId("macrame_planter"),
    },
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
    createDockBlocks().lay(asVehicleId(g.car.id), g.car, []);
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
        const docks = createDockBlocks((_, at) => keys.has(cellKey(at)));
        docks.lay(asVehicleId(f.car.id), f.car, wanted);
        const allowed = wanted.filter((c) => !keys.has(cellKey(c)));
        expect(f.writes).toEqual(allowed.map(cellKey));
        expect(
          f.saved.get(DECK_CELLS_PROPERTY) === undefined ? [] : f.savedCells(),
        ).toEqual(allowed);
      }),
    );
  });
});

it("maps and restores a shared drawer/counter cell with counter-only block states", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const),
      fc.option(fc.constantFrom(...STANDING_GEAR_IDS), { nil: undefined }),
      (face, counter) => {
        const block = {
          type: "drawers" as const,
          face,
          height: 7.1,
          ...(counter === undefined ? {} : { counter: decorItemId(counter) }),
        };
        const code =
          counter === undefined ? 0 : STANDING_GEAR_IDS.indexOf(counter) + 1;
        const expected = {
          "yasu_ride:face": face,
          "yasu_ride:counter_page": Math.floor(code / PAIR_PAGE_SIZE),
          "yasu_ride:counter_item": code % PAIR_PAGE_SIZE,
        };
        expect(drawerBlockStates(block)).toEqual(expected);
        const f = fixture();
        const wanted = [{ ...cellOf({ x: 1, y: 65, z: 2 }), block }];
        const layer = createDockBlocks();
        layer.lay(asVehicleId("car"), f.car, wanted);
        expect(f.at(defined(wanted[0], "drawer cell"))).toEqual({
          typeId: pairDecorBlockId("drawers"),
          states: expected,
        });
        expect(f.savedCells()).toEqual(wanted);
        const restored = createDockBlocks();
        restored.lay(asVehicleId("car"), f.car, wanted);
        expect(f.writes).toHaveLength(1);
        restored.lay(asVehicleId("car"), f.car, []);
        expect(f.at(defined(wanted[0], "drawer cell")).typeId).toBe(
          "minecraft:air",
        );
      },
    ),
  );
});
