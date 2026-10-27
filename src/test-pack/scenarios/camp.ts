// In-game checks of the camp feature's low chair (ADR 0122).
import { type Entity, system } from "@minecraft/server";
import {
  CAMP_TABLE_TYPE,
  CHAIR_FAMILY,
  FIRE_PIT_COVERED_PROPERTY,
  FIRE_PIT_ITEM,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
  LOW_CHAIR_ITEM,
  LOW_CHAIR_TYPE,
  TEST_CHAIR_HIT_EVENT,
  TEST_FIRE_PIT_COVER_EVENT,
  TEST_FIRE_PIT_EVENT,
  TEST_FIRE_PIT_HIT_EVENT,
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

// Beside the first chair's cell, on the same edge.
const GRASS_CELL = { x: CELL.x, z: CELL.z + 3 } as const;

/**
 * Summons a chair where a click on short grass places it, a block above the grass, and
 * checks that it settles through the grass onto the ground under it (ADR 0122).
 */
export async function lowChairSettlesThroughGrass(a: Arena): Promise<Outcome> {
  const ground = { x: GRASS_CELL.x, y: a.gy - 1, z: GRASS_CELL.z };
  const plant = { ...ground, y: a.gy };
  a.dim.runCommand(`setblock ${ground.x} ${ground.y} ${ground.z} grass_block`);
  a.dim.runCommand(`setblock ${plant.x} ${plant.y} ${plant.z} short_grass`);
  const at = { x: GRASS_CELL.x + 0.5, y: a.gy + 1, z: GRASS_CELL.z + 0.5 };
  a.dim.runCommand(`summon ${LOW_CHAIR_TYPE} ${at.x} ${at.y} ${at.z}`);
  const chair = a.dim.getEntities({
    type: LOW_CHAIR_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  try {
    if (!chair) return { pass: false, detail: "chair not spawned" };
    await wait(20);
    const y = chair.location.y;
    const grass = a.dim.getBlock(plant)?.typeId;
    return {
      pass: Math.abs(y - a.gy) < 0.05 && grass === "minecraft:short_grass",
      detail: `y=${y.toFixed(3)} ground=${a.gy} plant=${grass}`,
    };
  } finally {
    if (chair?.isValid) chair.remove();
    a.dim.runCommand(`setblock ${plant.x} ${plant.y} ${plant.z} air`);
    a.dim.runCommand(`setblock ${ground.x} ${ground.y} ${ground.z} stone`);
  }
}

/** Confirms that the outside table loads as a persistent two-seat entity. */
export function campTableTwoSeats(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 8.5 };
  a.dim.runCommand(`summon ${CAMP_TABLE_TYPE} ${at.x} ${at.y} ${at.z}`);
  const table = a.dim.getEntities({
    type: CAMP_TABLE_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  try {
    const seats = table?.getComponent("minecraft:rideable")?.seatCount;
    const family = table?.matches({ families: ["yasu_ride_camp_table"] });
    return Promise.resolve({
      pass: seats === 2 && family === true,
      detail: `seats=${seats} family=${family}`,
    });
  } finally {
    if (table?.isValid) table.remove();
  }
}

/** Checks the fire pit's initial state and both directions of the ignition toggle. */
export async function firePitIgnition(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 11.5 };
  a.dim.runCommand(`summon ${FIRE_PIT_TYPE} ${at.x} ${at.y} ${at.z}`);
  const pit = a.dim.getEntities({
    type: FIRE_PIT_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!pit) return { pass: false, detail: "fire pit not spawned" };
  try {
    const initial = pit.getProperty(FIRE_PIT_LIT_PROPERTY);
    system.sendScriptEvent(TEST_FIRE_PIT_EVENT, pit.id);
    await wait(2);
    const burning = pit.getProperty(FIRE_PIT_LIT_PROPERTY);
    system.sendScriptEvent(TEST_FIRE_PIT_EVENT, pit.id);
    await wait(2);
    const extinguished = pit.getProperty(FIRE_PIT_LIT_PROPERTY);
    const family = pit.matches({ families: ["yasu_ride_fire_pit"] });
    return {
      pass:
        initial === false &&
        burning === true &&
        extinguished === false &&
        family,
      detail: `initial=${initial} burning=${burning} extinguished=${extinguished} family=${family}`,
    };
  } finally {
    if (pit.isValid) pit.remove();
  }
}

/** Covered hits leave the pit intact and do not count toward folding it. */
export async function firePitCoveredTakeBack(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 11.5 };
  a.dim.runCommand(`summon ${FIRE_PIT_TYPE} ${at.x} ${at.y} ${at.z}`);
  const pit = a.dim.getEntities({
    type: FIRE_PIT_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!pit) return { pass: false, detail: "fire pit not spawned" };
  const items = () =>
    a.dim
      .getEntities({
        type: "minecraft:item",
        location: at,
        maxDistance: 2,
      })
      .filter(
        (entity) =>
          entity.getComponent("minecraft:item")?.itemStack.typeId ===
          FIRE_PIT_ITEM,
      );
  try {
    const initial = pit.getProperty(FIRE_PIT_COVERED_PROPERTY);
    system.sendScriptEvent(TEST_FIRE_PIT_COVER_EVENT, pit.id);
    await wait(2);
    const covered = pit.getProperty(FIRE_PIT_COVERED_PROPERTY);
    for (let i = 0; i < 3; i++) {
      system.sendScriptEvent(TEST_FIRE_PIT_HIT_EVENT, pit.id);
      await wait(2);
    }
    if (!pit.isValid) return { pass: false, detail: "covered pit folded" };
    const coveredDrops = items().length;
    system.sendScriptEvent(TEST_FIRE_PIT_COVER_EVENT, pit.id);
    await wait(2);
    const uncovered = pit.getProperty(FIRE_PIT_COVERED_PROPERTY);
    let survivedFirstTwo = true;
    for (let i = 0; i < 3; i++) {
      if (!pit.isValid)
        return {
          pass: false,
          detail: "pit folded before three uncovered hits",
        };
      system.sendScriptEvent(TEST_FIRE_PIT_HIT_EVENT, pit.id);
      await wait(2);
      if (i < 2) survivedFirstTwo &&= pit.isValid;
    }
    const amount = items().reduce(
      (sum, entity) =>
        sum + (entity.getComponent("minecraft:item")?.itemStack.amount ?? 0),
      0,
    );
    return {
      pass:
        initial === false &&
        covered === true &&
        coveredDrops === 0 &&
        uncovered === false &&
        survivedFirstTwo &&
        !pit.isValid &&
        amount === 1,
      detail: `initial=${initial} covered=${covered} coveredDrops=${coveredDrops} uncovered=${uncovered} survivedFirstTwo=${survivedFirstTwo} folded=${!pit.isValid} items=${amount}`,
    };
  } finally {
    if (pit.isValid) pit.remove();
    for (const item of items()) item.remove();
  }
}
