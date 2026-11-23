import { system } from "@minecraft/server";
import {
  BEACH_CHAIR,
  FURNITURE_IDS,
  TEST_BEACH_CHAIR_PLACE,
  TEST_FURNITURE_PLACE,
} from "../../infrastructure/resort/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

export async function resortGearOverlap(a: Arena): Promise<Outcome> {
  const foot = a.at(110, a.gy - 1, 15);
  const nextFoot = { ...foot, x: foot.x + 1 };
  const head = { ...foot, z: foot.z + 2 };
  const nextHead = { ...head, x: nextFoot.x };
  const saved = [foot.x, nextFoot.x].flatMap((x) =>
    [0, 1, 2].flatMap((dz) =>
      [0, 1, 2].map((dy) => {
        const block = a.dim.getBlock({ x, y: foot.y + dy, z: foot.z + dz });
        return { block, previous: block?.permutation, support: dy === 0 };
      }),
    ),
  );
  const near = (type: string) =>
    a.dim.getEntities({ type, location: foot, maxDistance: 4 });
  const chairs = () => near(BEACH_CHAIR);
  const tables = () => near(FURNITURE_IDS.dining_table.entity);
  const diningChairs = () => near(FURNITURE_IDS.dining_chair.entity);
  const event = async (id: string, message: string) => {
    system.sendScriptEvent(id, message);
    await wait(2);
  };
  try {
    for (const { block, support } of saved)
      block?.setType(support ? "minecraft:stone" : "minecraft:air");
    await event(TEST_BEACH_CHAIR_PLACE, `${foot.x} ${foot.y} ${foot.z} 0`);
    const first = chairs()[0];
    if (!first) return { pass: false, detail: "first beach chair was refused" };

    await event(
      TEST_FURNITURE_PLACE,
      `dining_table ${head.x} ${head.y} ${head.z} 0`,
    );
    if (tables().length || !first.isValid)
      return {
        pass: false,
        detail: "dining table replaced or overlapped the beach chair",
      };

    await event(
      TEST_FURNITURE_PLACE,
      `dining_chair ${nextHead.x} ${nextHead.y} ${nextHead.z} 0`,
    );
    const diningChair = diningChairs()[0];
    if (!diningChair)
      return { pass: false, detail: "adjacent dining chair was refused" };

    await event(
      TEST_BEACH_CHAIR_PLACE,
      `${nextFoot.x} ${nextFoot.y} ${nextFoot.z} 0`,
    );
    const pass = chairs().length === 1 && first.isValid && diningChair.isValid;
    return {
      pass,
      detail: pass
        ? "both overlapping placements refused and adjacent placement accepted"
        : "second beach chair replaced or overlapped the dining chair",
    };
  } finally {
    for (const entity of [...chairs(), ...tables(), ...diningChairs()])
      entity.remove();
    await wait(2);
    for (const { block, previous } of saved)
      if (previous) block?.setPermutation(previous);
  }
}
