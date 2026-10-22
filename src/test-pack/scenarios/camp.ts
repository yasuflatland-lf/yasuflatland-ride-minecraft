// In-game checks of the camp feature's low chair (ADR 0121).
import { type Entity, system } from "@minecraft/server";
import {
  CHAIR_FAMILY,
  LOW_CHAIR_ITEM,
  LOW_CHAIR_TYPE,
  TEST_CHAIR_HIT_EVENT,
} from "../../infrastructure/camp/identifiers";
import { type Arena, type Outcome, wait } from "../arena";

// On the arena's east edge, past the camping gear row (z 1-19) and clear of the
// camper park spot (x 103-114, z 73-84) and the camper tank (z 61-69).
const CELL = { x: 119, z: 40 } as const;

const hit = (chair: Entity) =>
  system.sendScriptEvent(TEST_CHAIR_HIT_EVENT, chair.id);

/** Summons a chair, checks its one seat, and folds it back with three hits into one dropped item. */
export async function lowChairSeatAndTakeBack(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 0.5 };
  a.dim.runCommand(`summon ${LOW_CHAIR_TYPE} ${at.x} ${at.y} ${at.z}`);
  const chair = a.dim.getEntities({
    type: LOW_CHAIR_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!chair) return { pass: false, detail: "chair not spawned" };
  const chairItems = () =>
    a.dim
      .getEntities({ type: "minecraft:item", location: at, maxDistance: 2 })
      .filter(
        (e) =>
          e.getComponent("minecraft:item")?.itemStack.typeId === LOW_CHAIR_ITEM,
      );
  try {
    const seats = chair.getComponent("minecraft:rideable")?.seatCount;
    const family = chair.matches({ families: [CHAIR_FAMILY] });
    hit(chair);
    await wait(2);
    const afterOne = chair.isValid;
    hit(chair);
    await wait(2);
    hit(chair);
    await wait(2);
    const afterThree = chair.isValid;
    const items = chairItems();
    const amount = items.reduce(
      (n, e) => n + (e.getComponent("minecraft:item")?.itemStack.amount ?? 0),
      0,
    );
    return {
      pass: seats === 1 && family && afterOne && !afterThree && amount === 1,
      detail: `seats=${seats} family=${family} afterOne=${afterOne} afterThree=${afterThree} items=${amount}`,
    };
  } finally {
    if (chair.isValid) chair.remove();
    for (const item of chairItems()) item.remove();
  }
}
