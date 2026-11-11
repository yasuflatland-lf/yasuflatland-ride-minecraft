import { beforeEach, expect, it, vi } from "vitest";
import { FURNITURE_SPEC } from "../../../src/domain/resort/furniture";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import type { Cell } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockToiletWorld } from "../../../src/infrastructure/resort/bedrock/bedrockToiletWorld";
import {
  FURNITURE_IDS,
  TOILET_FLUSHING,
  TOILET_LID_OPEN,
} from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  GameMode: { Creative: "Creative" },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const id = asFurnitureId("toilet");
const playerId = asPlayerId("player");
function fixture(yaw = 0) {
  const dimension = {
    id: "minecraft:overworld",
    getEntities: vi.fn((_query: unknown) => [{ id }]),
    getBlock: vi.fn((cell: Cell) => ({
      typeId: cell.y === 63 ? "minecraft:stone" : "minecraft:air",
      isAir: cell.y !== 63,
      isLiquid: false,
    })),
  };
  const rideable = {
    getRiders: vi.fn<() => { id: string; typeId: string }[]>(() => []),
    addRider: vi.fn(() => true),
  };
  const entity = {
    id,
    typeId: FURNITURE_IDS.toilet.entity,
    isValid: true,
    dimension,
    location: { x: 10.5, y: 64, z: 20.5 },
    getRotation: () => ({ y: yaw }),
    getComponent: vi.fn(() => rideable),
    setProperty: vi.fn(),
  };
  const player = {
    id: playerId,
    typeId: "minecraft:player",
    isValid: true,
    dimension,
    getComponent: vi.fn<() => unknown>(() => undefined),
    teleport: vi.fn(),
    onScreenDisplay: { setActionBar: vi.fn() },
  };
  game.getEntity.mockImplementation((query: string) =>
    query === id ? entity : query === playerId ? player : undefined,
  );
  game.getDimension.mockReturnValue(dimension);
  const deps = {
    isVehicleSpace: vi.fn(() => false),
    isCampSpace: vi.fn(() => false),
  };
  return {
    entity,
    player,
    dimension,
    rideable,
    deps,
    adapter: new BedrockToiletWorld(deps),
  };
}
it("finds the first player rider and ignores non-player riders", () => {
  const f = fixture();
  expect(f.adapter.riderOf(id)).toBeUndefined();
  f.rideable.getRiders.mockReturnValue([
    { id: "pig", typeId: "minecraft:pig" },
  ]);
  expect(f.adapter.riderOf(id)).toBeUndefined();
  f.rideable.getRiders.mockReturnValue([
    { id: "pig", typeId: "minecraft:pig" },
    { id: playerId, typeId: "minecraft:player" },
    { id: "other", typeId: "minecraft:player" },
  ]);
  expect(f.adapter.riderOf(id)).toBe(playerId);
  f.entity.getComponent.mockReturnValue(undefined as never);
  expect(f.adapter.riderOf(id)).toBeUndefined();
});
it("collects loaded toilet ids from every dimension", () => {
  const f = fixture();
  game.getDimension.mockImplementation((name: string) => ({
    getEntities: (query: unknown) => {
      f.dimension.getEntities(query);
      return [{ id: name }];
    },
  }));
  expect(f.adapter.loadedToilets()).toEqual(["overworld", "nether", "the_end"]);
  expect(game.getDimension.mock.calls.map(([name]) => name)).toEqual([
    "overworld",
    "nether",
    "the_end",
  ]);
  expect(f.dimension.getEntities).toHaveBeenCalledTimes(3);
  expect(f.dimension.getEntities).toHaveBeenCalledWith({
    type: FURNITURE_IDS.toilet.entity,
  });
});
it("teleports to the configured seat before adding the rider", () => {
  const f = fixture();
  expect(f.adapter.seat(id, playerId)).toBe(true);
  const seat = FURNITURE_SPEC.toilet.seats[0];
  expect(f.player.teleport).toHaveBeenCalledExactlyOnceWith(
    { x: 10.5, y: 64 + (seat?.y ?? 0), z: 20.5 - (seat?.z ?? 0) },
    { dimension: f.dimension },
  );
  expect(f.player.teleport).toHaveBeenCalledBefore(f.rideable.addRider);
  expect(f.rideable.addRider).toHaveBeenCalledExactlyOnceWith(f.player);
});
it.each([
  "missing toilet",
  "invalid toilet",
  "missing player",
  "invalid player",
  "riding",
  "other dimension",
  "rejected mount",
  "throwing mount",
])("refuses seating for %s", (reason) => {
  const f = fixture();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  if (reason === "missing toilet")
    game.getEntity.mockImplementation((query: string) =>
      query === playerId ? f.player : undefined,
    );
  if (reason === "invalid toilet") f.entity.isValid = false;
  if (reason === "missing player")
    game.getEntity.mockImplementation((query: string) =>
      query === id ? f.entity : undefined,
    );
  if (reason === "invalid player") f.player.isValid = false;
  if (reason === "riding") f.player.getComponent.mockReturnValue({});
  if (reason === "other dimension")
    f.player.dimension = { ...f.dimension, id: "minecraft:nether" };
  if (reason === "rejected mount") f.rideable.addRider.mockReturnValue(false);
  if (reason === "throwing mount")
    f.rideable.addRider.mockImplementation(() => {
      throw Error("unloaded");
    });
  expect(f.adapter.seat(id, playerId)).toBe(false);
  if (reason === "throwing mount")
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("toilet seating failed"),
    );
});
it.each([true, false])("writes lid and flush properties as %s", (on) => {
  const f = fixture();
  f.adapter.setLid(id, on);
  f.adapter.setFlushing(id, on);
  expect(f.entity.setProperty.mock.calls).toEqual([
    [TOILET_LID_OPEN, on],
    [TOILET_FLUSHING, on],
  ]);
});
it.each([
  "missing toilet",
  "missing player",
  "invalid player",
  "other dimension",
  "riding",
])("does not place a player beside a toilet for %s", (reason) => {
  const f = fixture();
  if (reason === "missing toilet")
    game.getEntity.mockImplementation((query: string) =>
      query === playerId ? f.player : undefined,
    );
  if (reason === "missing player")
    game.getEntity.mockImplementation((query: string) =>
      query === id ? f.entity : undefined,
    );
  if (reason === "invalid player") f.player.isValid = false;
  if (reason === "other dimension")
    f.player.dimension = { ...f.dimension, id: "minecraft:nether" };
  if (reason === "riding") f.player.getComponent.mockReturnValue({});
  f.adapter.placeBeside(id, playerId);
  expect(f.player.teleport).not.toHaveBeenCalled();
  expect(f.dimension.getBlock).not.toHaveBeenCalled();
});
it.each([
  [0, { x: 10.5, y: 64, z: 21.5 }],
  [90, { x: 9.5, y: 64, z: 20.5 }],
  [180, { x: 10.5, y: 64, z: 19.5 }],
  [270, { x: 11.5, y: 64, z: 20.5 }],
])("places the player in front at snapped yaw %s", (yaw, expected) => {
  const f = fixture(yaw + 5);
  f.adapter.placeBeside(id, playerId);
  expect(f.player.teleport).toHaveBeenCalledExactlyOnceWith(expected, {
    dimension: f.dimension,
  });
  expect(f.deps.isVehicleSpace).toHaveBeenCalledWith(f.dimension.id, {
    x: expected.x - 0.5,
    y: expected.y,
    z: expected.z - 0.5,
  });
  expect(f.deps.isCampSpace).toHaveBeenCalledWith(f.dimension.id, {
    x: expected.x - 0.5,
    y: expected.y + 1,
    z: expected.z - 0.5,
  });
});
it.each(["vehicle", "camp", "unavailable", "liquid", "decoration", "solid"])(
  "leaves the engine exit position when terrain is %s everywhere",
  (reason) => {
    const f = fixture();
    if (reason === "vehicle") f.deps.isVehicleSpace.mockReturnValue(true);
    if (reason === "camp") f.deps.isCampSpace.mockReturnValue(true);
    if (reason === "unavailable")
      f.dimension.getBlock.mockImplementation(() => {
        throw Error("unloaded");
      });
    if (reason === "liquid")
      f.dimension.getBlock.mockImplementation((cell) => ({
        typeId: "minecraft:water",
        isAir: cell.y !== 63,
        isLiquid: cell.y === 63,
      }));
    if (reason === "decoration")
      f.dimension.getBlock.mockImplementation((cell) => ({
        typeId: cell.y === 63 ? "minecraft:short_grass" : "minecraft:air",
        isAir: cell.y !== 63,
        isLiquid: false,
      }));
    if (reason === "solid")
      f.dimension.getBlock.mockReturnValue({
        typeId: "minecraft:stone",
        isAir: false,
        isLiquid: false,
      });
    f.adapter.placeBeside(id, playerId);
    expect(f.player.teleport).not.toHaveBeenCalled();
  },
);
it.each([56, 64, 68])(
  "excludes the toilet column when its only safe floor is at height %s",
  (height) => {
    const f = fixture();
    f.dimension.getBlock.mockImplementation((cell) => ({
      typeId: cell.y === height - 1 ? "minecraft:stone" : "minecraft:air",
      isAir: cell.y !== height - 1,
      isLiquid: false,
    }));
    f.deps.isVehicleSpace.mockImplementation(
      (_dimension?: unknown, cell?: Cell) => cell?.x !== 10 || cell?.z !== 20,
    );
    f.adapter.placeBeside(id, playerId);
    expect(f.player.teleport).not.toHaveBeenCalled();
  },
);
it("searches outward when the front cell is obstructed", () => {
  const f = fixture();
  f.deps.isCampSpace.mockImplementation(
    (_dimension?: unknown, cell?: Cell) => cell?.x === 10 && cell?.z === 21,
  );
  f.adapter.placeBeside(id, playerId);
  expect(f.player.teleport).toHaveBeenCalledExactlyOnceWith(
    { x: 9.5, y: 64, z: 20.5 },
    { dimension: f.dimension },
  );
});
it.each(["occupied", "flushing"] as const)(
  "shows the %s refusal key",
  (reason) => {
    const f = fixture();
    f.adapter.showRefused(playerId, reason);
    expect(
      f.player.onScreenDisplay.setActionBar,
    ).toHaveBeenCalledExactlyOnceWith({
      translate: `yasu_ride.toilet.${reason}`,
    });
  },
);
it("ignores missing, wrong-type, invalid and throwing entity lookups", () => {
  const f = fixture();
  for (const entity of [
    undefined,
    { ...f.entity, typeId: "minecraft:pig" },
    { ...f.entity, isValid: false },
  ]) {
    game.getEntity.mockReturnValue(entity);
    expect(f.adapter.entity(id)).toBeUndefined();
    expect(f.adapter.riderOf(id)).toBeUndefined();
    expect(() => f.adapter.setLid(id, true)).not.toThrow();
    expect(() => f.adapter.setFlushing(id, true)).not.toThrow();
  }
  game.getEntity.mockImplementation(() => {
    throw Error("unloaded");
  });
  expect(f.adapter.entity(id)).toBeUndefined();
  expect(f.adapter.seat(id, playerId)).toBe(false);
});
