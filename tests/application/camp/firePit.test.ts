import { expect, it, vi } from "vitest";
import { FirePitActions } from "../../../src/application/camp/firePit";
import type { FirePitWorld } from "../../../src/application/camp/ports/firePit";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const pit = asFirePitId("pit");
const player = asPlayerId("player");
const dimension = asDimensionId("overworld");

function fixture(failSpawn = false) {
  let lit = false;
  const wearFlintAndSteel = vi.fn();
  const world = {
    isAir: () => true,
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    hasFirePitNear: () => false,
    isCreative: vi.fn(() => false),
    consumeItem: vi.fn(() => true),
    refund: vi.fn(),
    spawnFirePit: vi.fn(() => (failSpawn ? undefined : pit)),
    isCovered: vi.fn(() => false),
    showCoveredHint: vi.fn(),
    isLit: () => lit,
    setLit: vi.fn((_id, value: boolean) => {
      lit = value;
    }),
    wearFlintAndSteel,
    dropItem: vi.fn(),
    removeFirePit: vi.fn(),
    showHitsLeft: vi.fn(),
  } satisfies FirePitWorld;
  return { actions: new FirePitActions(world), world, wearFlintAndSteel };
}

it("requires ordinary flint and steel to light an unlit pit, then extinguishes on any tap", () => {
  const { actions, world, wearFlintAndSteel } = fixture();
  expect(actions.toggle(pit, player, undefined, 2)).toBe(false);
  expect(actions.toggle(pit, player, "minecraft:fire_charge", 2)).toBe(false);
  expect(world.setLit).not.toHaveBeenCalled();
  expect(actions.toggle(pit, player, "minecraft:flint_and_steel", 2)).toBe(
    true,
  );
  expect(world.setLit).toHaveBeenLastCalledWith(pit, true);
  expect(wearFlintAndSteel).toHaveBeenCalledWith(player, 2);
  expect(wearFlintAndSteel).toHaveBeenCalledTimes(1);
  expect(actions.toggle(pit, player, undefined, 2)).toBe(true);
  expect(world.setLit).toHaveBeenLastCalledWith(pit, false);
  expect(wearFlintAndSteel).toHaveBeenCalledTimes(1);
});

it("places on clear ground outside vehicle space and folds back after three hits", () => {
  const { actions, world } = fixture();
  const block = { x: 4, y: 60, z: 5 };
  expect(actions.place({ player, dimension, block, yaw: 47, slot: 1 })).toBe(
    true,
  );
  expect(world.spawnFirePit).toHaveBeenCalledWith(
    dimension,
    { x: 4.5, y: 61, z: 5.5 },
    90,
  );
  expect(actions.hit(pit, player, 1)).toBe(false);
  expect(actions.hit(pit, player, 2)).toBe(false);
  expect(actions.hit(pit, player, 3)).toBe(true);
  expect(world.dropItem).toHaveBeenCalledOnce();
  expect(world.removeFirePit).toHaveBeenCalledOnce();
});

it("refuses covered hits without advancing or resetting the fold counter", () => {
  for (const previousHits of [0, 1, 2]) {
    const { actions, world } = fixture();
    for (let tick = 1; tick <= previousHits; tick++)
      expect(actions.hit(pit, player, tick)).toBe(false);
    world.showHitsLeft.mockClear();
    world.isCovered.mockReturnValue(true);
    for (let tick = 3; tick <= 5; tick++)
      expect(actions.hit(pit, player, tick)).toBe(false);
    expect(world.dropItem).not.toHaveBeenCalled();
    expect(world.removeFirePit).not.toHaveBeenCalled();
    expect(world.showHitsLeft).not.toHaveBeenCalled();
    expect(world.showCoveredHint).toHaveBeenCalledTimes(3);
    expect(world.showCoveredHint).toHaveBeenLastCalledWith(player);
    world.isCovered.mockReturnValue(false);
    for (let hit = 1; hit <= 3 - previousHits; hit++)
      expect(actions.hit(pit, player, 5 + hit)).toBe(hit === 3 - previousHits);
    expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(pit);
    expect(world.removeFirePit).toHaveBeenCalledExactlyOnceWith(pit);
  }
});

it.each(["Survival", "Creative", "playerless"])(
  "refunds only a paid Fire Pit item when spawning fails (%s)",
  (mode) => {
    const { actions, world } = fixture(true);
    world.isCreative.mockReturnValue(mode === "Creative");
    const payer = mode === "playerless" ? undefined : player;
    expect(
      actions.place({
        player: payer,
        dimension,
        block: { x: 4, y: 60, z: 5 },
        yaw: 47,
        slot: 1,
      }),
    ).toBe(false);
    expect(world.spawnFirePit).toHaveBeenCalledOnce();
    expect(world.consumeItem.mock.calls).toEqual(
      mode === "Survival" ? [[payer, 1]] : [],
    );
    expect(world.refund.mock.calls).toEqual(
      mode === "Survival" ? [[payer, 1]] : [],
    );
  },
);
