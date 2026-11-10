import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { structureHandle } from "../../../src/domain/build/structure/handle";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
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
}));
vi.mock("@minecraft/server", () => ({
  StructureSaveMode: { Memory: "Memory" },
  world: { getDimension: engine.getDimension, structureManager: engine },
}));
const dimension = {
  heightRange: { min: -64, max: 320 },
  getEntities: engine.getEntities,
  runCommand: engine.runCommand,
};
const dim = asDimensionId("overworld");
const owner = asPlayerId("-4294967295");
const box = { min: { x: 10, y: 64, z: -5 }, max: { x: 12, y: 67, z: -1 } };
const handle = structureHandle("yasu_build:box_test_1");
const store = () => new BedrockStructureStore(isFleetEntityType);
const entity = (id: string, typeId: string, location = box.min) => ({
  id,
  typeId,
  location,
  remove: vi.fn(),
});
beforeEach(() => {
  vi.resetAllMocks();
  engine.getDimension.mockReturnValue(dimension);
  engine.getEntities.mockReturnValue([]);
});

it("captures Memory blocks and entities with unique names, skipping names surviving reload", () => {
  const first = structureIdentifier(owner, 1);
  engine.get.mockImplementation((name) => (name === first ? {} : undefined));
  const adapter = store();
  expect(adapter.capture(dim, box, owner)).toBe(structureIdentifier(owner, 2));
  expect(adapter.capture(dim, box, owner)).toBe(structureIdentifier(owner, 3));
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
      { min: box.min, max: { ...box.max, x: box.min.x + 64 } },
      owner,
    ),
  ).toBe("tooLarge");
  expect(engine.getDimension).not.toHaveBeenCalled();
  for (const y of [-65, 320])
    expect(
      adapter.capture(
        dim,
        { min: { ...box.min, y }, max: { ...box.max, y } },
        owner,
      ),
    ).toBe("unreadable");
  expect(engine.createFromWorld).not.toHaveBeenCalled();
  for (const y of [-64, 319])
    expect(
      adapter.capture(
        dim,
        { min: { ...box.min, y }, max: { ...box.max, y } },
        owner,
      ),
    ).not.toBe("unreadable");
});

it.each(["getDimension", "get", "createFromWorld"] as const)(
  "maps arbitrary throws from %s to unreadable",
  (method) => {
    fc.assert(
      fc.property(fc.anything(), (error) => {
        engine[method].mockImplementation(() => {
          throw error;
        });
        expect(store().capture(dim, box, owner)).toBe("unreadable");
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
  const large = { min: { x: 0, y: 0, z: 0 }, max: { x: 63, y: 255, z: 63 } };
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
