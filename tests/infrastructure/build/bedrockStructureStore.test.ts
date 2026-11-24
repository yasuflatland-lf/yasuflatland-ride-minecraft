import { StructureRotation } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { cellBox } from "../../../src/domain/build/box";
import type { QuarterTurn } from "../../../src/domain/build/rotation/quarterTurn";
import { structureHandle } from "../../../src/domain/build/structure/handle";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";
import { BedrockStructureStore } from "../../../src/infrastructure/build/bedrock/bedrockStructureStore";
import { structureIdentifier } from "../../../src/infrastructure/build/bedrock/structureGeometry";
import {
  DECK_SEAT_TYPE,
  ENTITY_TYPE,
  isFleetEntityType,
  SEAT_FILLER_TYPE,
  standInType,
} from "../../../src/infrastructure/vehicle/bedrock/identifiers";

const engine = vi.hoisted(() => ({
  getDimension: vi.fn(),
  get: vi.fn(),
  createFromWorld: vi.fn(),
  place: vi.fn(),
  delete: vi.fn(),
  getEntities: vi.fn(),
  runCommand: vi.fn(),
  getBlocks: vi.fn(),
  setBlockPermutation: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  BlockPermutation: { resolve: (typeId: string) => ({ typeId }) },
  BlockVolume: class {
    constructor(
      readonly from: unknown,
      readonly to: unknown,
    ) {}
  },
  StructureRotation: {
    None: "None",
    Rotate90: "Rotate90",
    Rotate180: "Rotate180",
    Rotate270: "Rotate270",
  },
  StructureSaveMode: { Memory: "Memory" },
  world: { getDimension: engine.getDimension, structureManager: engine },
}));
const dimension = {
  heightRange: { min: -64, max: 320 },
  getEntities: engine.getEntities,
  runCommand: engine.runCommand,
  getBlocks: engine.getBlocks,
};
const dim = asDimensionId("overworld");
const owner = asPlayerId("-4294967295");
const box = cellBox(
  cellOf({ x: 10, y: 64, z: -5 }),
  cellOf({ x: 12, y: 67, z: -1 }),
);
const handle = structureHandle("yasu_build:box_test_1");
const WARP_BLOCK = "yasu_build:warp_block";
const store = () => new BedrockStructureStore(isFleetEntityType, [WARP_BLOCK]);
const listed = (cells: { x: number; y: number; z: number }[]) => ({
  getBlockLocationIterator: () => cells[Symbol.iterator](),
});
const entity = (id: string, typeId: string, location: Vec3 = box.min) => ({
  id,
  typeId,
  location,
  remove: vi.fn(),
});
beforeEach(() => {
  vi.resetAllMocks();
  engine.getDimension.mockReturnValue(dimension);
  engine.getEntities.mockReturnValue([]);
  engine.createFromWorld.mockReturnValue({
    setBlockPermutation: engine.setBlockPermutation,
  });
  engine.getBlocks.mockReturnValue(listed([]));
});

it("captures Memory blocks and entities with unique names, skipping names surviving reload", () => {
  const first = structureIdentifier(owner, 1);
  engine.get.mockImplementation((name) => (name === first ? {} : undefined));
  const adapter = store();
  expect(adapter.capture(dim, box, owner, "exact")).toBe(
    structureIdentifier(owner, 2),
  );
  expect(adapter.capture(dim, box, owner, "exact")).toBe(
    structureIdentifier(owner, 3),
  );
  expect(engine.createFromWorld).toHaveBeenLastCalledWith(
    structureIdentifier(owner, 3),
    dimension,
    box.min,
    box.max,
    { saveMode: "Memory", includeBlocks: true, includeEntities: true },
  );
});

it("refuses oversized and out-of-height captures without reading blocks", () => {
  const adapter = store();
  expect(
    adapter.capture(
      dim,
      cellBox(box.min, { ...box.max, x: box.min.x + 64 }),
      owner,
      "exact",
    ),
  ).toBe("tooLarge");
  expect(engine.getDimension).not.toHaveBeenCalled();
  for (const y of [-65, 320])
    expect(
      adapter.capture(
        dim,
        cellBox({ ...box.min, y }, { ...box.max, y }),
        owner,
        "exact",
      ),
    ).toBe("unreadable");
  expect(engine.createFromWorld).not.toHaveBeenCalled();
  for (const y of [-64, 319])
    expect(
      adapter.capture(
        dim,
        cellBox({ ...box.min, y }, { ...box.max, y }),
        owner,
        "exact",
      ),
    ).not.toBe("unreadable");
});

it("turns uncopyable blocks into air inside a copy, relative to the box minimum", () => {
  engine.getBlocks.mockReturnValue(
    listed([box.min, { x: 11, y: 66, z: -2 }, box.max]),
  );
  const name = structureIdentifier(owner, 1);
  expect(store().capture(dim, box, owner, "copy")).toBe(name);
  expect(engine.getBlocks).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ from: box.min, to: box.max }),
    { includeTypes: [WARP_BLOCK] },
  );
  expect(engine.setBlockPermutation.mock.calls).toEqual([
    [{ x: 0, y: 0, z: 0 }, { typeId: "minecraft:air" }],
    [{ x: 1, y: 2, z: 3 }, { typeId: "minecraft:air" }],
    [{ x: 2, y: 3, z: 4 }, { typeId: "minecraft:air" }],
  ]);
  expect(engine.delete).not.toHaveBeenCalled();
});

it("keeps every block in an exact capture and when no block type is uncopyable", () => {
  engine.getBlocks.mockReturnValue(listed([box.min]));
  expect(store().capture(dim, box, owner, "exact")).not.toBe("unreadable");
  expect(
    new BedrockStructureStore(isFleetEntityType, []).capture(
      dim,
      box,
      owner,
      "copy",
    ),
  ).not.toBe("unreadable");
  expect(engine.getBlocks).not.toHaveBeenCalled();
  expect(engine.setBlockPermutation).not.toHaveBeenCalled();
});

it.each(["getBlocks", "setBlockPermutation"] as const)(
  "deletes a copy whose uncopyable blocks cannot be removed when %s throws",
  (method) => {
    engine.getBlocks.mockReturnValue(listed([box.min]));
    engine[method].mockImplementation(() => {
      throw new Error("unloaded");
    });
    expect(store().capture(dim, box, owner, "copy")).toBe("unreadable");
    expect(engine.delete).toHaveBeenCalledWith(structureIdentifier(owner, 1));
  },
);

it.each(["getDimension", "get", "createFromWorld"] as const)(
  "maps arbitrary throws from %s to unreadable",
  (method) => {
    fc.assert(
      fc.property(fc.anything(), (error) => {
        engine[method].mockImplementation(() => {
          throw error;
        });
        expect(store().capture(dim, box, owner, "exact")).toBe("unreadable");
      }),
    );
  },
);

it("synchronously removes only new fleet entities inside destination bounds", () => {
  const types = [
    ...Object.values(ENTITY_TYPE),
    DECK_SEAT_TYPE,
    SEAT_FILLER_TYPE,
    standInType("camper_bumper", "x"),
  ];
  const originals = types.map((type, i) => entity(`old${i}`, type));
  const copies = types.map((type, i) =>
    entity(`new${i}`, type, { x: 12.9, y: 67.9, z: -0.1 }),
  );
  const kept = [
    entity("player", "minecraft:player"),
    entity("cow", "minecraft:cow"),
    entity("outside", ENTITY_TYPE.suv, { x: 13, y: 64, z: -5 }),
  ];
  const structure = { size: { x: 3, y: 4, z: 5 } };
  engine.get.mockReturnValue(structure);
  engine.getEntities
    .mockReturnValueOnce(originals)
    .mockReturnValueOnce([...originals, ...copies, ...kept]);
  expect(store().place(handle, dim, box.min)).toBe(true);
  expect(engine.place).toHaveBeenCalledWith(structure, dimension, box.min, {
    rotation: StructureRotation.None,
    includeBlocks: true,
    includeEntities: true,
  });
  for (const copy of copies) expect(copy.remove).toHaveBeenCalledOnce();
  for (const e of [...originals, ...kept])
    expect(e.remove).not.toHaveBeenCalled();
});

it("refuses a missing structure and engine failures without throwing", () => {
  const adapter = store();
  expect(adapter.place(handle, dim, box.min)).toBe(false);
  expect(engine.place).not.toHaveBeenCalled();
  engine.get.mockReturnValue({ size: { x: 1, y: 1, z: 1 } });
  engine.place.mockImplementation(() => {
    throw new Error("unloaded");
  });
  expect(adapter.place(handle, dim, box.min)).toBe(false);
});

it("clears ordinary entities but preserves players, fleet entities and outside entities despite invalid entries", () => {
  const kept = [
    entity("p", "minecraft:player"),
    ...[
      ...Object.values(ENTITY_TYPE),
      DECK_SEAT_TYPE,
      SEAT_FILLER_TYPE,
      standInType("camper_bumper", "z"),
    ].map((type) => entity(type, type)),
    entity("out", "minecraft:cow", { ...box.min, x: 13 }),
  ];
  const cow = entity("cow", "minecraft:cow", { x: 12.99, y: 67.99, z: -0.01 });
  const stale = entity("stale", "minecraft:cow");
  stale.remove.mockImplementation(() => {
    throw new Error("invalid");
  });
  engine.getEntities.mockReturnValue([
    {
      get location() {
        throw new Error("invalid");
      },
    },
    ...kept,
    stale,
    cow,
  ]);
  expect(() => store().clearEntities(dim, box)).not.toThrow();
  expect(cow.remove).toHaveBeenCalledOnce();
  for (const e of kept) expect(e.remove).not.toHaveBeenCalled();
});

it("fills every chunk with air without destroy and reports command failures", () => {
  const large = cellBox(
    cellOf({ x: 0, y: 0, z: 0 }),
    cellOf({ x: 63, y: 255, z: 63 }),
  );
  expect(store().clearBlocks(dim, large)).toBe(true);
  expect(engine.runCommand).toHaveBeenCalledTimes(32);
  expect(engine.runCommand).toHaveBeenNthCalledWith(
    1,
    "fill 0 0 0 63 255 1 air",
  );
  expect(engine.runCommand).toHaveBeenLastCalledWith(
    "fill 0 0 62 63 255 63 air",
  );
  engine.runCommand
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw new Error("unloaded");
    });
  expect(store().clearBlocks(dim, large)).toBe(false);
});

it("discards repeatedly, ignoring missing handles and deletion errors", () => {
  const adapter = store();
  engine.delete
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false)
    .mockImplementationOnce(() => {
      throw new Error("missing");
    });
  for (let i = 0; i < 3; i++)
    expect(() => adapter.discard(handle)).not.toThrow();
  expect(engine.delete).toHaveBeenCalledTimes(3);
  expect(engine.delete).toHaveBeenLastCalledWith(handle);
});

it.each([
  [undefined, StructureRotation.None],
  [0, StructureRotation.None],
  [1, StructureRotation.Rotate90],
  [2, StructureRotation.Rotate180],
  [3, StructureRotation.Rotate270],
] as const)("maps turn %s to %s", (turn, rotation) => {
  const structure = { size: { x: 3, y: 4, z: 5 } };
  engine.get.mockReturnValue(structure);
  expect(store().place(handle, dim, box.min, turn)).toBe(true);
  expect(engine.place).toHaveBeenCalledWith(structure, dimension, box.min, {
    rotation,
    includeBlocks: true,
    includeEntities: true,
  });
});

it.each([1, 3] as const)(
  "uses the rotated footprint for entity bookkeeping at turn %s",
  (turn: QuarterTurn) => {
    engine.get.mockReturnValue({ size: { x: 3, y: 4, z: 5 } });
    const original = entity("original", ENTITY_TYPE.suv, {
      x: 14,
      y: 64,
      z: -3,
    });
    const copy = entity("copy", ENTITY_TYPE.suv, original.location);
    const outside = entity("outside", ENTITY_TYPE.suv, { x: 10, y: 64, z: -2 });
    engine.getEntities
      .mockReturnValueOnce([original])
      .mockReturnValueOnce([original, copy, outside]);
    expect(store().place(handle, dim, box.min, turn)).toBe(true);
    expect(copy.remove).toHaveBeenCalledOnce();
    expect(original.remove).not.toHaveBeenCalled();
    expect(outside.remove).not.toHaveBeenCalled();
  },
);
