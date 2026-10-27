import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { DutchOvenActions } from "../../../src/application/camp/dutchOven";
import type { DutchOvenWorld } from "../../../src/application/camp/ports/dutchOven";
import { asDutchOvenId } from "../../../src/domain/camp/dutchOven";
import { DUTCH_OVEN_SPEC } from "../../../src/domain/camp/spec";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const oven = asDutchOvenId("oven");
const player = asPlayerId("player");
const dimension = asDimensionId("overworld");
const block = { x: 4, y: 60, z: 5 };
const command = { player, dimension, block, yaw: 47, slot: 1 };

function fixture(overrides: Partial<DutchOvenWorld> = {}) {
  const world = {
    isAir: vi.fn(() => true),
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    hasDutchOvenNear: () => false,
    isCreative: () => false,
    consumeItem: vi.fn(() => true),
    spawnDutchOven: vi.fn(),
    dropItem: vi.fn(),
    removeDutchOven: vi.fn(),
    showHitsLeft: vi.fn(),
    ...overrides,
  } satisfies DutchOvenWorld;
  return { actions: new DutchOvenActions(world), world };
}

it("accepts only block tops outside add-on rooms", () => {
  const { actions } = fixture();
  expect(actions.canUseBlock(dimension, block, "up")).toBe(true);
  expect(actions.canUseBlock(dimension, block, "other")).toBe(false);
  expect(
    fixture({ isOwnBlock: () => true }).actions.canUseBlock(
      dimension,
      block,
      "up",
    ),
  ).toBe(false);
});

it("rejects either blocked clearance cell or vehicle space before consumption", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: DUTCH_OVEN_SPEC.clearance }),
      fc.boolean(),
      (dy, vehicle) => {
        const { actions, world } = fixture(
          vehicle
            ? { isVehicleSpace: (_d, at) => at.y === block.y + dy }
            : { isAir: (_d, at) => at.y !== block.y + dy },
        );
        expect(actions.place(command)).toBe(false);
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawnDutchOven).not.toHaveBeenCalled();
      },
    ),
  );
});

it("refuses a nearby oven or a changed inventory slot", () => {
  for (const overrides of [
    { hasDutchOvenNear: () => true },
    { consumeItem: () => false },
  ]) {
    const { actions, world } = fixture(overrides);
    expect(actions.place(command)).toBe(false);
    expect(world.spawnDutchOven).not.toHaveBeenCalled();
  }
});

it("consumes only outside Creative and snaps any yaw to quarter turns", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -720, max: 720 }),
      fc.boolean(),
      (yaw, creative) => {
        const { actions, world } = fixture({ isCreative: () => creative });
        expect(actions.place({ ...command, yaw })).toBe(true);
        expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
        if (!creative)
          expect(world.consumeItem).toHaveBeenCalledWith(player, 1);
        expect(world.spawnDutchOven).toHaveBeenCalledWith(
          dimension,
          { x: 4.5, y: 61, z: 5.5 },
          Math.round(yaw / 90) * 90,
        );
      },
    ),
  );
});

it("returns exactly one item on the third quick hit and resets after a long gap", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: DUTCH_OVEN_SPEC.hitResetTicks }),
      (tick, gap) => {
        const { actions, world } = fixture();
        expect(actions.hit(oven, player, tick)).toBe(false);
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 2);
        const restart = tick + DUTCH_OVEN_SPEC.hitResetTicks + 1;
        expect(actions.hit(oven, player, restart)).toBe(false);
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 2);
        expect(actions.hit(oven, player, restart + gap)).toBe(false);
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 1);
        expect(world.dropItem).not.toHaveBeenCalled();
        expect(actions.hit(oven, player, restart + gap * 2)).toBe(true);
        expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(oven);
        expect(world.removeDutchOven).toHaveBeenCalledExactlyOnceWith(oven);
      },
    ),
  );
});
