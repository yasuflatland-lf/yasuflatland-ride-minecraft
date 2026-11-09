import { beforeEach, expect, it, vi } from "vitest";
import {
  beachChairOrigin,
  beachChairPose,
} from "../../../src/domain/resort/beachChair";
import { asBeachChairId } from "../../../src/domain/resort/ids";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockBeachChairWorld } from "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLD_EVENT,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_LOUNGE_ANIMATION,
  BEACH_CHAIR_LOUNGE_CONTROLLER,
  BEACH_CHAIR_UNFOLD_EVENT,
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
  let folded = true;
  const dimension = {
    id: dimensionId,
    getBlock: vi.fn(),
    getEntities: vi.fn<
      () => { location: { x: number; y: number; z: number } }[]
    >(() => []),
    getBlockFromRay: vi.fn(),
    spawnEntity: vi.fn(),
    spawnItem: vi.fn(),
  };
  let riders: unknown[] = [];
  const addRider = vi.fn(() => true);
  const entity = {
    id,
    typeId: BEACH_CHAIR,
    isValid: true,
    dimension,
    location: beachChairOrigin(pose),
    getProperty: () => folded,
    setProperty: vi.fn((_name: string, value: boolean) => {
      folded = value;
    }),
    getComponent: () => ({ getRiders: () => riders, addRider }),
    getRotation: () => ({ y: pose.yaw }),
    clearVelocity: vi.fn(),
    teleport: vi.fn(),
    remove: vi.fn(),
    triggerEvent: vi.fn(),
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
    addRider,
    pose,
    dimension,
    setRiders: (value: unknown[]) => {
      riders = value;
    },
    entity,
    deps,
    adapter: new BedrockBeachChairWorld(deps),
  };
}
it.each([true, false])(
  "reports form and rider occupancy when folded is %s",
  (folded) => {
    const f = fixture();
    f.entity.setProperty(BEACH_CHAIR_FOLDED, folded);
    for (const riders of [[], [{ id: "p", typeId: "minecraft:player" }]]) {
      f.setRiders(riders);
      expect(f.adapter.state(id)).toEqual({
        form: folded ? "table" : "chair",
        occupied: riders.length > 0,
        somethingOnTop: false,
      });
    }
  },
);
it.each([0, 90, 180, 270])(
  "folds and holds the placement pose at yaw %i",
  (yaw) => {
    const f = fixture(yaw);
    f.entity.location = { ...f.entity.location, y: f.entity.location.y - 0.01 };
    f.adapter.setForm(id, "table");
    expect(f.entity.setProperty).toHaveBeenCalledWith(BEACH_CHAIR_FOLDED, true);
    expect(f.entity.triggerEvent).toHaveBeenCalledExactlyOnceWith(
      BEACH_CHAIR_FOLD_EVENT,
    );
    expect(f.entity.clearVelocity).toHaveBeenCalledOnce();
    expect(f.entity.teleport).toHaveBeenCalledExactlyOnceWith(
      beachChairOrigin(f.pose),
    );
    expect(f.entity.triggerEvent.mock.invocationCallOrder[0]).toBeLessThan(
      f.entity.clearVelocity.mock.invocationCallOrder[0] ?? 0,
    );
    expect(f.entity.clearVelocity.mock.invocationCallOrder[0]).toBeLessThan(
      f.entity.teleport.mock.invocationCallOrder[0] ?? 0,
    );
  },
);
it("unfolds without holding the entity", () => {
  const f = fixture();
  f.adapter.setForm(id, "chair");
  expect(f.entity.setProperty).toHaveBeenCalledWith(BEACH_CHAIR_FOLDED, false);
  expect(f.entity.triggerEvent).toHaveBeenCalledExactlyOnceWith(
    BEACH_CHAIR_UNFOLD_EVENT,
  );
  expect(f.entity.clearVelocity).not.toHaveBeenCalled();
  expect(f.entity.teleport).not.toHaveBeenCalled();
});
it("removes the chair entity", () => {
  const f = fixture();
  f.adapter.remove(id);
  expect(f.entity.remove).toHaveBeenCalledOnce();
});
it("tolerates an entity unloading while holding its pose", () => {
  const f = fixture();
  f.entity.clearVelocity.mockImplementation(() => {
    throw Error("unloaded");
  });
  expect(() => f.adapter.setForm(id, "table")).not.toThrow();
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
  f.setRiders([player]);
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
