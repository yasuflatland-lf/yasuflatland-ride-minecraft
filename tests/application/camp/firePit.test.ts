import { expect, it, vi } from "vitest";
import { FirePitActions } from "../../../src/application/camp/firePit";
import type { FirePitWorld } from "../../../src/application/camp/ports/firePit";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const pit = asFirePitId("pit");
const player = asPlayerId("player");
const dimension = asDimensionId("overworld");

function fixture() {
  let lit = false;
  const wearFlintAndSteel = vi.fn();
  const world = {
    isAir: () => true,
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    hasFirePitNear: () => false,
    isCreative: () => false,
    consumeItem: () => true,
    spawnFirePit: vi.fn(),
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
