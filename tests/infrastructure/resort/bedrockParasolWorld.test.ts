import { beforeEach, expect, it, vi } from "vitest";
import { asParasolId } from "../../../src/domain/resort/ids";
import {
  parasolCeilingCells,
  parasolPose,
} from "../../../src/domain/resort/parasolPose";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockParasolWorld } from "../../../src/infrastructure/resort/bedrock/bedrockParasolWorld";
import {
  BEACH_PARASOL,
  PARASOL_CEILING_BLOCK,
  PARASOL_CEILING_PROPERTY,
} from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  Direction: { Up: "Up" },
  BlockPermutation: { resolve: (typeId: string) => ({ typeId }) },
  GameMode: { Creative: "Creative" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));
beforeEach(() => vi.clearAllMocks());
const id = asParasolId("parasol");
const dimensionId = asDimensionId("overworld");
function fixture() {
  const pose = parasolPose({ x: 10, y: 63, z: 20 }, 0);
  const wanted = parasolCeilingCells(pose);
  const blocks = new Map<
    string,
    { typeId: string; isAir: boolean; setPermutation: ReturnType<typeof vi.fn> }
  >();
  const key = (cell: { x: number; y: number; z: number }) =>
    JSON.stringify(cell);
  for (const cell of wanted) {
    const block = {
      typeId: "minecraft:air",
      isAir: true,
      setPermutation: vi.fn((permutation: { typeId: string }) => {
        block.typeId = permutation.typeId;
        block.isAir = permutation.typeId === "minecraft:air";
      }),
    };
    blocks.set(key(cell), block);
  }
  const dimension = {
    id: dimensionId,
    getBlock: vi.fn((cell: { x: number; y: number; z: number }) =>
      blocks.get(key(cell)),
    ),
    getEntities: vi.fn(() => []),
    getBlockFromRay: vi.fn(),
    spawnEntity: vi.fn(),
    spawnItem: vi.fn(),
  };
  const saved = new Map<string, unknown>();
  const entity = {
    id,
    typeId: BEACH_PARASOL,
    isValid: true,
    dimension,
    location: { x: pose.base.x + 0.5, y: pose.base.y, z: pose.base.z + 0.5 },
    getRotation: () => ({ y: pose.yaw }),
    getDynamicProperty: (name: string) => saved.get(name),
    setDynamicProperty: vi.fn((name: string, value: unknown) =>
      saved.set(name, value),
    ),
    remove: vi.fn(),
    setRotation: vi.fn(),
  };
  game.getDimension.mockReturnValue(dimension);
  game.getEntity.mockImplementation((query: string) =>
    query === id ? entity : undefined,
  );
  const deps = {
    isVehicleSpace: vi.fn(() => false),
    isCampSpace: vi.fn(() => false),
  };
  return {
    pose,
    wanted,
    blocks,
    key,
    dimension,
    saved,
    entity,
    deps,
    adapter: new BedrockParasolWorld(deps),
  };
}
it("saves laid cells, restores them in a fresh adapter, and preserves replacement blocks", () => {
  const f = fixture();
  f.adapter.layCeiling(id);
  expect(JSON.parse(String(f.saved.get(PARASOL_CEILING_PROPERTY)))).toEqual(
    f.wanted,
  );
  const first = f.wanted[0];
  const second = f.wanted[1];
  if (!first || !second) throw Error("missing test footprint");
  const a = f.blocks.get(f.key(first));
  const b = f.blocks.get(f.key(second));
  if (!a || !b) throw Error("missing blocks");
  a.typeId = "minecraft:air";
  a.isAir = true;
  b.typeId = "minecraft:stone";
  b.isAir = false;
  const restored = new BedrockParasolWorld(f.deps);
  restored.layCeiling(id);
  expect(a.typeId).toBe(PARASOL_CEILING_BLOCK);
  expect(b.typeId).toBe("minecraft:stone");
  expect(restored.ceilingOwner(dimensionId, first, PARASOL_CEILING_BLOCK)).toBe(
    id,
  );
  restored.clearCeiling(id);
  expect(a.isAir).toBe(true);
  expect(b.typeId).toBe("minecraft:stone");
  expect(f.saved.get(PARASOL_CEILING_PROPERTY)).toBeUndefined();
});
it("retains unloaded cells for cleanup after the entity has gone", () => {
  const f = fixture();
  f.adapter.layCeiling(id);
  const cell = f.wanted[0];
  if (!cell) throw Error("empty footprint");
  const block = f.blocks.get(f.key(cell));
  if (!block) throw Error("missing block");
  f.blocks.delete(f.key(cell));
  game.getEntity.mockReturnValue(undefined);
  f.adapter.clearCeiling(id);
  expect(f.adapter.ceilingOwner(dimensionId, cell, PARASOL_CEILING_BLOCK)).toBe(
    id,
  );
  f.blocks.set(f.key(cell), block);
  f.adapter.clearCeiling(id);
  expect(block.isAir).toBe(true);
  expect(
    f.adapter.ceilingOwner(dimensionId, cell, PARASOL_CEILING_BLOCK),
  ).toBeUndefined();
});
it("skips vehicle space and never claims an unrelated ceiling", () => {
  const f = fixture();
  f.deps.isVehicleSpace.mockReturnValue(true);
  f.adapter.layCeiling(id);
  expect(f.saved.get(PARASOL_CEILING_PROPERTY)).toBeUndefined();
  f.deps.isVehicleSpace.mockReturnValue(false);
  for (const block of f.blocks.values()) {
    block.isAir = false;
    block.typeId = PARASOL_CEILING_BLOCK;
  }
  f.adapter.layCeiling(id);
  f.adapter.clearCeiling(id);
  expect(
    [...f.blocks.values()].every((b) => b.typeId === PARASOL_CEILING_BLOCK),
  ).toBe(true);
});
it("requires a ray to meet the requested block's full top face", () => {
  const f = fixture();
  const cell = { x: 1, y: 2, z: 3 };
  for (const height of [0.5, 1]) {
    f.dimension.getBlockFromRay.mockReturnValue({
      face: "Up",
      faceLocation: { y: height },
      block: { location: cell },
    });
    expect(f.adapter.isSolidTop(dimensionId, cell)).toBe(height === 1);
  }
  f.dimension.getBlockFromRay.mockReturnValue(undefined);
  expect(f.adapter.isSolidTop(dimensionId, cell)).toBe(false);
});
it("rolls back an entity when rotation fails and refunds through inventory overflow handling", () => {
  const f = fixture();
  f.dimension.spawnEntity.mockReturnValue(f.entity);
  f.entity.setRotation.mockImplementation(() => {
    throw Error("setter failed");
  });
  expect(f.adapter.spawn(dimensionId, f.pose)).toBeUndefined();
  expect(f.entity.remove).toHaveBeenCalledOnce();
  const container = { addItem: vi.fn((item: unknown) => item) };
  const player = {
    typeId: "minecraft:player",
    getComponent: () => ({ container }),
    dimension: f.dimension,
    location: { x: 0, y: 64, z: 0 },
  };
  game.getEntity.mockReturnValue(player);
  f.adapter.refund(asPlayerId("player"), 0);
  expect(container.addItem).toHaveBeenCalledOnce();
  expect(f.dimension.spawnItem).toHaveBeenCalledOnce();
});

it("clears stale saved cells outside the current footprint after restoration", () => {
  const f = fixture();
  const stale = { x: 100, y: 100, z: 100 };
  const block = {
    typeId: PARASOL_CEILING_BLOCK,
    isAir: false,
    setPermutation: vi.fn((p: { typeId: string }) => {
      block.typeId = p.typeId;
    }),
  };
  f.blocks.set(f.key(stale), block);
  f.saved.set(PARASOL_CEILING_PROPERTY, JSON.stringify([stale]));
  f.adapter.layCeiling(id);
  expect(block.typeId).toBe("minecraft:air");
  expect(JSON.parse(String(f.saved.get(PARASOL_CEILING_PROPERTY)))).toEqual(
    f.wanted,
  );
});
