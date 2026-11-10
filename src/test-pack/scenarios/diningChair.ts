import { system } from "@minecraft/server";
import {
  FURNITURE_SPEC,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
} from "../../domain/resort/furniture";
import {
  FURNITURE_IDS,
  TEST_FURNITURE_HIT,
  TEST_FURNITURE_PLACE,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

export async function diningChairPlaceTakeBack(a: Arena): Promise<Outcome> {
  const block = a.at(110, a.gy - 1, 15);
  const pose = furniturePose(block, 0, "dining_chair");
  const ids = FURNITURE_IDS.dining_chair;
  const near = (type: string) =>
    a.dim.getEntities({ type, location: pose.origin, maxDistance: 2 });
  const drops = () =>
    near("minecraft:item").filter(
      (entity) =>
        entity.getComponent("minecraft:item")?.itemStack.typeId === ids.item,
    );
  const supports = furnitureSupportCells(pose);
  const clear = furnitureClearCells(pose);
  const saved = [...supports, ...clear].map((cell) => ({
    cell,
    permutation: a.dim.getBlock(cell)?.permutation,
  }));
  try {
    for (const cell of supports)
      a.dim.getBlock(cell)?.setType("minecraft:stone");
    for (const cell of clear) a.dim.getBlock(cell)?.setType("minecraft:air");
    system.sendScriptEvent(
      TEST_FURNITURE_PLACE,
      `dining_chair ${block.x} ${block.y} ${block.z} 0`,
    );
    await wait(2);
    const chairs = near(ids.entity);
    const entity = chairs[0];
    if (!entity || chairs.length !== 1)
      return {
        pass: false,
        detail: `expected one chair, found ${chairs.length}`,
      };
    const rideable = entity.getComponent("minecraft:rideable");
    const seat = rideable?.getSeats()[0]?.position;
    const expectedSeat = FURNITURE_SPEC.dining_chair.seats[0];
    const seatMatches =
      seat !== undefined &&
      expectedSeat !== undefined &&
      Math.abs(seat.x - expectedSeat.x) < 1e-6 &&
      Math.abs(seat.y - expectedSeat.y) < 1e-6 &&
      Math.abs(seat.z - expectedSeat.z) < 1e-6;
    const contract =
      rideable?.seatCount === 1 &&
      seatMatches &&
      entity
        .getComponent("minecraft:type_family")
        ?.hasTypeFamily("yasu_ride_dining_chair") === true;
    for (let hit = 0; hit < 2; hit++) {
      system.sendScriptEvent(TEST_FURNITURE_HIT, entity.id);
      await wait(2);
    }
    const kept = entity.isValid && drops().length === 0;
    system.sendScriptEvent(TEST_FURNITURE_HIT, entity.id);
    await wait(2);
    const gone = !entity.isValid;
    const returned =
      drops().reduce(
        (sum, item) =>
          sum + (item.getComponent("minecraft:item")?.itemStack.amount ?? 0),
        0,
      ) === 1;
    return {
      pass: contract && kept && gone && returned,
      detail: `contract=${contract} kept=${kept} gone=${gone} returned=${returned}`,
    };
  } finally {
    for (const entity of [...near(ids.entity), ...drops()]) entity.remove();
    for (const { cell, permutation } of saved)
      if (permutation) a.dim.getBlock(cell)?.setPermutation(permutation);
  }
}
