import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { GasLanternActions } from "../../../src/application/camp/gasLantern";
import type { GasLanternWorld } from "../../../src/application/camp/ports/gasLantern";
import { asGasLanternId } from "../../../src/domain/camp/gasLantern";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const player = asPlayerId("player");
const dimension = asDimensionId("overworld");
const cmd = {
  player,
  dimension,
  block: { x: 4, y: 60, z: 5 },
  yaw: 0,
  slot: 1,
};
function fixture() {
  const world = {
    isAir: vi.fn<GasLanternWorld["isAir"]>(() => true),
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    hasGasLanternNear: vi.fn(() => false),
    isCreative: () => false,
    consumeItem: vi.fn(() => true),
    spawnGasLantern: vi.fn(),
    dropItem: vi.fn(),
    removeGasLantern: vi.fn(),
    showHitsLeft: vi.fn(),
  } satisfies GasLanternWorld;
  return { actions: new GasLanternActions(world), world };
}

it("needs one clear cell above the pressed block, but no second cell", () => {
  for (const blockedY of [61, 62]) {
    const { actions, world } = fixture();
    world.isAir.mockImplementation((_d, at) => at.y !== blockedY);
    expect(actions.place(cmd)).toBe(blockedY === 62);
    expect(world.spawnGasLantern).toHaveBeenCalledTimes(
      blockedY === 62 ? 1 : 0,
    );
    expect(world.consumeItem).toHaveBeenCalledTimes(blockedY === 62 ? 1 : 0);
  }
});

it("asks only about nearby Gas Lanterns before consuming an item", () => {
  for (const nearType of ["gas_lantern", "fire_pit"]) {
    const { actions, world } = fixture();
    world.hasGasLanternNear.mockReturnValue(nearType === "gas_lantern");
    expect(actions.place(cmd)).toBe(nearType !== "gas_lantern");
    expect(world.hasGasLanternNear).toHaveBeenCalledWith(dimension, {
      x: 4.5,
      y: 61,
      z: 5.5,
    });
    expect(world.consumeItem).toHaveBeenCalledTimes(
      nearType === "gas_lantern" ? 0 : 1,
    );
  }
});

it("spawns above the pressed block with yaw snapped to quarter turns", () => {
  fc.assert(
    fc.property(fc.double({ min: -360, max: 360, noNaN: true }), (yaw) => {
      const { actions, world } = fixture();
      expect(actions.place({ ...cmd, yaw })).toBe(true);
      expect(world.spawnGasLantern).toHaveBeenCalledExactlyOnceWith(
        dimension,
        { x: 4.5, y: 61, z: 5.5 },
        Math.round(yaw / 90) * 90,
      );
    }),
  );
});

it("takes back only the lantern hit three times and hints after earlier hits", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 2, maxLength: 2 }),
      (start, gaps) => {
        const { actions, world } = fixture();
        const first = asGasLanternId("first");
        const second = asGasLanternId("second");
        const ticks = [
          start,
          start + (gaps[0] ?? 1),
          start + (gaps[0] ?? 1) + (gaps[1] ?? 1),
        ];
        for (const [i, tick] of ticks.entries()) {
          expect(actions.hit(first, player, tick)).toBe(i === 2);
          if (i < 2) {
            expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 2 - i);
            expect(actions.hit(second, player, tick)).toBe(false);
            expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 2 - i);
          }
        }
        expect(world.showHitsLeft).toHaveBeenCalledTimes(4);
        expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(first);
        expect(world.removeGasLantern).toHaveBeenCalledExactlyOnceWith(first);
        expect(actions.hit(second, player, ticks[2] ?? start)).toBe(true);
        expect(world.dropItem).toHaveBeenLastCalledWith(second);
        expect(world.removeGasLantern).toHaveBeenLastCalledWith(second);
      },
    ),
  );
});
