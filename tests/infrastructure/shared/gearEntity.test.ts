import type { Entity, Player } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import {
  CHAIR_SPEC,
  DUTCH_OVEN_SPEC,
  FIRE_PIT_SPEC,
  GAS_LANTERN_SPEC,
  ROOF_TENT_SPEC,
  TABLE_SPEC,
  TENT_SPEC,
} from "../../../src/domain/camp/spec";
import { FURNITURE_SPEC } from "../../../src/domain/resort/furniture";
import {
  BEACH_CHAIR_SPEC,
  PARASOL_SPEC,
} from "../../../src/domain/resort/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  gearEntities,
  gearFeedback,
  gearGroundChecks,
  giveBack,
  giveBackReceiver,
  spawnIn,
} from "../../../src/infrastructure/shared/gearEntity";

const game = vi.hoisted(() => ({ getDimension: vi.fn(), getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  Direction: { Up: "Up" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));

const dimension = asDimensionId("overworld");
const at = cellOf({ x: 1, y: 64, z: -2 });
const id = "gear-id";
const typeId = "test:gear";
const itemId = "test:gear_item";

beforeEach(() => vi.resetAllMocks());

it("only finds and removes valid entities of the configured types", () => {
  const gear = gearEntities(new Set([typeId, "test:other_gear"]));
  const remove = vi.fn();
  const entity = { typeId, isValid: true, remove };
  for (const result of [
    undefined,
    { ...entity, typeId: "minecraft:pig" },
    { ...entity, isValid: false },
  ]) {
    game.getEntity.mockReturnValue(result);
    expect(gear.entity(id)).toBeUndefined();
    gear.remove(id);
  }
  game.getEntity.mockImplementation(() => {
    throw new Error("malformed ID");
  });
  expect(gear.entity(id)).toBeUndefined();
  gear.remove(id);
  expect(remove).not.toHaveBeenCalled();

  game.getEntity.mockReturnValue(entity);
  expect(gear.entity(id)).toBe(entity);
  gear.remove(id);
  expect(remove).toHaveBeenCalledOnce();
});

it("returns undefined when the requested dimension is unknown", () => {
  game.getDimension.mockImplementation(() => {
    throw new Error("unknown dimension");
  });
  expect(spawnIn(dimension, typeId, at, 90)).toBeUndefined();
  expect(game.getDimension).toHaveBeenCalledExactlyOnceWith(dimension);
});

it("rotates the entity before setup and rolls it back if setup fails", () => {
  const entity = { setRotation: vi.fn(), remove: vi.fn() };
  const spawnEntity = vi.fn(() => entity);
  game.getDimension.mockReturnValue({ spawnEntity });
  const setup = vi.fn<(entity: Entity) => void>(() => {
    throw new Error("failed setup");
  });

  expect(spawnIn(dimension, typeId, at, 90, setup)).toBeUndefined();
  expect(spawnEntity).toHaveBeenCalledExactlyOnceWith(typeId, at);
  expect(entity.setRotation).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 90 });
  expect(entity.setRotation).toHaveBeenCalledBefore(setup);
  expect(setup).toHaveBeenCalledExactlyOnceWith(entity);
  expect(entity.remove).toHaveBeenCalledOnce();
});

it("returns one item to the receiver or drops it at the gear", () => {
  const spawnItem = vi.fn();
  const entity = {
    dimension: { spawnItem },
    location: at,
  } as unknown as Entity;
  const addItem = vi.fn();
  const receiver = {
    getComponent: () => ({ container: { addItem } }),
  } as unknown as Player;

  giveBack(entity, itemId, receiver);
  expect(addItem).toHaveBeenCalledExactlyOnceWith({
    typeId: itemId,
    amount: 1,
  });
  expect(spawnItem).not.toHaveBeenCalled();
  giveBack(entity, itemId);
  expect(spawnItem).toHaveBeenCalledExactlyOnceWith(
    { typeId: itemId, amount: 1 },
    at,
  );
});

it("selects the hitter only for tents and resort gear", () => {
  fc.assert(
    fc.property(fc.string().map(asPlayerId), (id) => {
      const player = { typeId: "minecraft:player" };
      game.getEntity.mockImplementation((key) =>
        key === id ? player : undefined,
      );
      for (const spec of [
        CHAIR_SPEC,
        TABLE_SPEC,
        FIRE_PIT_SPEC,
        GAS_LANTERN_SPEC,
        DUTCH_OVEN_SPEC,
      ]) {
        expect(giveBackReceiver(spec.giveBack, id)).toBeUndefined();
      }
      for (const spec of [
        TENT_SPEC,
        ROOF_TENT_SPEC,
        BEACH_CHAIR_SPEC,
        PARASOL_SPEC,
        ...Object.values(FURNITURE_SPEC),
      ]) {
        expect(giveBackReceiver(spec.giveBack, id)).toBe(player);
        expect(giveBackReceiver(spec.giveBack, undefined)).toBeUndefined();
      }
    }),
  );
});

it("sends the configured feedback keys with their translation arguments", () => {
  const playerId = asPlayerId("player");
  const setActionBar = vi.fn();
  game.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    isValid: true,
    onScreenDisplay: { setActionBar },
  });
  const feedback = gearFeedback("gear");
  feedback.showBlocked(playerId);
  feedback.showHitsLeft(playerId, 2);
  feedback.showTaken(playerId);
  feedback.showRefused(playerId, "occupied", []);
  feedback.showRefused(playerId, "busy");
  expect(setActionBar.mock.calls).toEqual([
    [{ translate: "yasu_ride.gear.blocked", with: [] }],
    [{ translate: "yasu_ride.gear.hits_left", with: ["2"] }],
    [{ translate: "yasu_ride.gear.taken", with: [] }],
    [{ translate: "yasu_ride.gear.occupied", with: [] }],
    [{ translate: "yasu_ride.gear.busy" }],
  ]);
});

it("checks block support and camp space in the requested dimension", () => {
  const getBlockFromRay = vi.fn(() => ({
    face: "Up",
    faceLocation: { y: 0 },
    block: { location: at },
  }));
  game.getDimension.mockReturnValue({ getBlockFromRay });
  const isCampSpace = vi.fn(() => true);
  const ground = gearGroundChecks({ isCampSpace });

  expect(ground.isSolidTop(dimension, at)).toBe(true);
  expect(game.getDimension).toHaveBeenCalledExactlyOnceWith(dimension);
  expect(ground.isCampSpace(dimension, at)).toBe(true);
  expect(isCampSpace).toHaveBeenCalledExactlyOnceWith(dimension, at);
});
