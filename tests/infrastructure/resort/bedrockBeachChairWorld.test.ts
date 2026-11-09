import { beforeEach, expect, it, vi } from "vitest";
import {
  beachChairOrigin,
  beachChairPose,
  tableBlockCells,
} from "../../../src/domain/resort/beachChair";
import { asBeachChairId } from "../../../src/domain/resort/ids";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockBeachChairWorld } from "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_LOUNGE_ANIMATION,
  BEACH_CHAIR_LOUNGE_CONTROLLER,
  BEACH_CHAIR_TOP,
  BEACH_CHAIR_TOP_CELLS,
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
const id = asBeachChairId("chair");
const dimensionId = asDimensionId("overworld");
function fixture(yaw = 0) {
  const pose = beachChairPose({ x: 10, y: 63, z: 20 }, yaw);
  const wanted = tableBlockCells(pose);
  let folded = true;
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
  for (const cell of wanted)
    blocks.set(key({ ...cell, y: cell.y + 1 }), {
      typeId: "minecraft:air",
      isAir: true,
      setPermutation: vi.fn(),
    });
  const dimension = {
    id: dimensionId,
    getBlock: vi.fn((cell: { x: number; y: number; z: number }) =>
      blocks.get(key(cell)),
    ),
    getEntities: vi.fn<
      () => { location: { x: number; y: number; z: number } }[]
    >(() => []),
    getBlockFromRay: vi.fn(),
    spawnEntity: vi.fn(),
    spawnItem: vi.fn(),
  };
  const saved = new Map<string, unknown>();
  const riders: { id: string; typeId: string }[] = [];
  const addRider = vi.fn(() => true);
  const entity = {
    id,
    typeId: BEACH_CHAIR,
    isValid: true,
    dimension,
    location: beachChairOrigin(pose),
    getProperty: () => folded,
    setProperty: (_name: string, value: boolean) => {
      folded = value;
    },
    getComponent: () => ({ getRiders: () => riders, addRider }),
    getRotation: () => ({ y: pose.yaw }),
    getDynamicProperty: (name: string) => saved.get(name),
    setDynamicProperty: vi.fn((name: string, value: unknown) =>
      saved.set(name, value),
    ),
    remove: vi.fn(),
    triggerEvent: vi.fn(),
    clearVelocity: vi.fn(),
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
    riders,
    addRider,
    pose,
    wanted,
    blocks,
    key,
    dimension,
    saved,
    entity,
    deps,
    adapter: new BedrockBeachChairWorld(deps),
  };
}
it.each([0, 90, 180, 270])("restores both tabletop cells at yaw %i", (yaw) => {
  const f = fixture(yaw);
  f.adapter.layTop(id);
  const restored = new BedrockBeachChairWorld(f.deps);
  restored.layTop(id);
  expect(JSON.parse(String(f.saved.get(BEACH_CHAIR_TOP_CELLS)))).toEqual(
    f.wanted,
  );
});

it("saves laid cells, restores them in a fresh adapter, and preserves replacement blocks", () => {
  const f = fixture();
  f.adapter.layTop(id);
  expect(JSON.parse(String(f.saved.get(BEACH_CHAIR_TOP_CELLS)))).toEqual(
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
  const restored = new BedrockBeachChairWorld(f.deps);
  restored.layTop(id);
  expect(a.typeId).toBe(BEACH_CHAIR_TOP);
  expect(b.typeId).toBe("minecraft:stone");
  expect(restored.topOwner(dimensionId, first, BEACH_CHAIR_TOP)).toBe(id);
  restored.clearTop(id);
  expect(a.isAir).toBe(true);
  expect(b.typeId).toBe("minecraft:stone");
  expect(f.saved.get(BEACH_CHAIR_TOP_CELLS)).toBeUndefined();
});
it("retains unloaded cells for cleanup after the entity has gone", () => {
  const f = fixture();
  f.adapter.layTop(id);
  const cell = f.wanted[0];
  if (!cell) throw Error("empty footprint");
  const block = f.blocks.get(f.key(cell));
  if (!block) throw Error("missing block");
  f.blocks.delete(f.key(cell));
  game.getEntity.mockReturnValue(undefined);
  f.adapter.clearTop(id);
  expect(f.adapter.topOwner(dimensionId, cell, BEACH_CHAIR_TOP)).toBe(id);
  f.blocks.set(f.key(cell), block);
  f.adapter.clearTop(id);
  expect(block.isAir).toBe(true);
  expect(
    f.adapter.topOwner(dimensionId, cell, BEACH_CHAIR_TOP),
  ).toBeUndefined();
});
it("skips vehicle space and never claims an unrelated tabletop", () => {
  const f = fixture();
  f.deps.isVehicleSpace.mockReturnValue(true);
  f.adapter.layTop(id);
  expect(f.saved.get(BEACH_CHAIR_TOP_CELLS)).toBeUndefined();
  f.deps.isVehicleSpace.mockReturnValue(false);
  for (const cell of f.wanted) {
    const block = f.blocks.get(f.key(cell));
    if (!block) throw Error("missing block");
    block.isAir = false;
    block.typeId = BEACH_CHAIR_TOP;
  }
  f.adapter.layTop(id);
  f.adapter.clearTop(id);
  expect(
    f.wanted.every((c) => f.blocks.get(f.key(c))?.typeId === BEACH_CHAIR_TOP),
  ).toBe(true);
});
it("clears stale saved cells outside the current footprint after restoration", () => {
  const f = fixture();
  const stale = { x: 100, y: 100, z: 100 };
  const block = {
    typeId: BEACH_CHAIR_TOP,
    isAir: false,
    setPermutation: vi.fn((p: { typeId: string }) => {
      block.typeId = p.typeId;
    }),
  };
  f.blocks.set(f.key(stale), block);
  f.saved.set(BEACH_CHAIR_TOP_CELLS, JSON.stringify([stale]));
  f.adapter.layTop(id);
  expect(block.typeId).toBe("minecraft:air");
  expect(JSON.parse(String(f.saved.get(BEACH_CHAIR_TOP_CELLS)))).toEqual(
    f.wanted,
  );
});

it("lays and clears on form changes, refuses contents, and clears stale chair-form records", () => {
  const f = fixture();
  f.adapter.setForm(id, "table");
  const cell = f.wanted[0];
  const above = f.blocks.get(f.key({ ...cell, y: cell.y + 1 }));
  if (!above) throw Error("missing above cell");
  expect(f.adapter.state(id)).toEqual({
    form: "table",
    occupied: false,
    somethingOnTop: false,
  });
  above.isAir = false;
  above.typeId = "minecraft:stone";
  expect(f.adapter.state(id)?.somethingOnTop).toBe(true);
  above.isAir = true;
  f.entity.setProperty("folded", false);
  const restored = new BedrockBeachChairWorld(f.deps);
  restored.syncTop(id);
  expect(f.wanted.every((c) => f.blocks.get(f.key(c))?.isAir)).toBe(true);
  expect(f.saved.get(BEACH_CHAIR_TOP_CELLS)).toBeUndefined();
  f.adapter.setForm(id, "table");
  f.adapter.setForm(id, "chair");
  expect(f.wanted.every((c) => f.blocks.get(f.key(c))?.isAir)).toBe(true);
});

it("uses player riders for occupancy and sends the existing lounge animation", () => {
  const f = fixture();
  const playerId = asPlayerId("rider");
  const player = {
    id: playerId,
    typeId: "minecraft:player",
    isValid: true,
    dimension: f.dimension,
    teleport: vi.fn(),
    playAnimation: vi.fn(),
    getComponent: vi.fn(() => undefined),
  };
  game.getEntity.mockImplementation((query: string) =>
    query === id ? f.entity : query === playerId ? player : undefined,
  );
  f.adapter.setForm(id, "chair");
  expect(f.adapter.seat(id, playerId)).toBe(true);
  expect(player.teleport).toHaveBeenCalledBefore(f.addRider);
  expect(f.addRider).toHaveBeenCalledExactlyOnceWith(player);
  f.riders.push(player);
  expect(f.adapter.riderOf(id)).toBe(playerId);
  expect(f.adapter.state(id)?.occupied).toBe(true);
  f.adapter.playLounge(playerId);
  expect(player.playAnimation).toHaveBeenCalledExactlyOnceWith(
    BEACH_CHAIR_LOUNGE_ANIMATION,
    {
      controller: BEACH_CHAIR_LOUNGE_CONTROLLER,
      stopExpression: "!query.is_riding",
    },
  );
});
it("places a dismounted player on supported clear ground outside the bed", () => {
  const f = fixture();
  const playerId = asPlayerId("rider");
  const player = {
    id: playerId,
    typeId: "minecraft:player",
    isValid: true,
    dimension: f.dimension,
    teleport:
      vi.fn<
        (at: { x: number; y: number; z: number }, options: unknown) => void
      >(),
    getComponent: vi.fn(() => undefined as unknown),
  };
  game.getEntity.mockImplementation((query: string) =>
    query === id ? f.entity : player,
  );
  f.dimension.getBlock.mockImplementation((cell) => ({
    typeId: cell.y === 63 ? "minecraft:stone" : "minecraft:air",
    isAir: cell.y !== 63,
    isLiquid: false,
    setPermutation: vi.fn(),
  }));
  f.adapter.placeBeside(id, playerId);
  const at = player.teleport.mock.calls[0]?.[0];
  expect(at).toEqual({ x: 11.5, y: 64, z: 21.5 });
  f.deps.isVehicleSpace.mockReturnValue(true);
  player.teleport.mockClear();
  f.adapter.placeBeside(id, playerId);
  expect(player.teleport).not.toHaveBeenCalled();
  f.deps.isVehicleSpace.mockReturnValue(false);
  player.getComponent.mockReturnValue({ entityRidingOn: { id: "other" } });
  f.adapter.placeBeside(id, playerId);
  expect(player.teleport).not.toHaveBeenCalled();
});

it.each([
  ["occupied", "occupied"],
  ["wrongForm", "folded"],
  ["somethingOnTop", "something_on_top"],
] as const)("shows the %s refusal hint", (reason, key) => {
  const f = fixture();
  const playerId = asPlayerId("player");
  const setActionBar = vi.fn();
  game.getEntity.mockImplementation((query: string) =>
    query === playerId
      ? {
          typeId: "minecraft:player",
          isValid: true,
          onScreenDisplay: { setActionBar },
        }
      : f.entity,
  );
  f.adapter.showRefused(playerId, reason);
  expect(setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: `yasu_ride.beach_chair.${key}`,
    with: [],
  });
});
