import type { Block, Entity, Player } from "@minecraft/server";
import { describe, expect, it, vi } from "vitest";
import { ridingItemTarget } from "../../../../src/infrastructure/vehicle/bedrock/handlers/ridingItemTarget";
import {
  ENTITY_TYPE,
  STAND_IN_OF_PROPERTY,
  standInType,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture() {
  const vehicle = {
    id: "vehicle",
    typeId: ENTITY_TYPE.camper,
    isValid: true,
  } as Entity;
  const other = {
    id: "other",
    typeId: ENTITY_TYPE.camper,
    isValid: true,
  } as Entity;
  const pig = { id: "pig", typeId: "minecraft:pig", isValid: true } as Entity;
  let mount: Entity | undefined = vehicle;
  const player = {
    getComponent: (name: string) =>
      name === "minecraft:riding" ? { entityRidingOn: mount } : undefined,
  } as Player;
  const standIn = {
    id: "stand-in",
    typeId: standInType("camper_bumper", "x"),
    isValid: true,
    getDynamicProperty: (key: string) =>
      key === STAND_IN_OF_PROPERTY ? vehicle.id : undefined,
  } as unknown as Entity;
  game.getEntity.mockImplementation((id: string) =>
    id === vehicle.id ? vehicle : undefined,
  );
  const onPress = vi.fn<(player: Player, vehicle: Entity) => void>();
  return {
    vehicle,
    other,
    pig,
    player,
    standIn,
    onPress,
    target: ridingItemTarget(onPress),
    ride(entity: Entity | undefined) {
      mount = entity;
    },
  };
}

describe("ridingItemTarget", () => {
  it("claims item use only on an add-on vehicle", () => {
    const f = fixture();
    expect(f.target.claimsItemUse(f.player)).toBe(true);
    f.ride(f.pig);
    expect(f.target.claimsItemUse(f.player)).toBe(false);
    f.ride(undefined);
    expect(f.target.claimsItemUse(f.player)).toBe(false);
  });

  it("claims entity presses only when the target resolves to the ridden vehicle", () => {
    const f = fixture();
    for (const [pressed, claimed] of [
      [f.vehicle, true],
      [f.standIn, true],
      [f.other, false],
      [f.pig, false],
    ] as const) {
      expect(f.target.claimsEntityPress(f.player, pressed)).toBe(claimed);
    }
    for (const mount of [f.pig, undefined]) {
      f.ride(mount);
      expect(f.target.claimsEntityPress(f.player, f.vehicle)).toBe(false);
      expect(f.target.claimsEntityPress(f.player, f.pig)).toBe(false);
    }
  });

  it("never claims block presses", () => {
    const f = fixture();
    for (const mount of [f.vehicle, f.pig, undefined]) {
      f.ride(mount);
      expect(f.target.claimsBlockPress(f.player, {} as Block)).toBe(false);
    }
  });

  it("passes the player and ridden vehicle to the action for item and matching entity presses", () => {
    const f = fixture();
    for (const pressed of [undefined, f.vehicle, f.standIn]) {
      f.onPress.mockClear();
      f.target.switchFor(f.player, pressed);
      expect(f.onPress).toHaveBeenCalledExactlyOnceWith(f.player, f.vehicle);
    }
  });

  it("ignores presses when no add-on vehicle is ridden", () => {
    const f = fixture();
    for (const mount of [undefined, f.pig]) {
      f.ride(mount);
      f.target.switchFor(f.player);
      f.target.switchFor(f.player, f.vehicle);
    }
    expect(f.onPress).not.toHaveBeenCalled();
  });

  it("ignores invalid, unrelated, and different vehicle targets", () => {
    const f = fixture();
    const invalid = {
      isValid: false,
      get typeId(): string {
        throw new Error("removed entity");
      },
    } as Entity;
    for (const pressed of [invalid, f.other, f.pig])
      f.target.switchFor(f.player, pressed);
    expect(f.onPress).not.toHaveBeenCalled();
  });

  it("rechecks the mount after claiming a deferred entity press", () => {
    const f = fixture();
    expect(f.target.claimsEntityPress(f.player, f.vehicle)).toBe(true);
    f.ride(f.other);
    f.target.switchFor(f.player, f.vehicle);
    expect(f.onPress).not.toHaveBeenCalled();
  });
});
