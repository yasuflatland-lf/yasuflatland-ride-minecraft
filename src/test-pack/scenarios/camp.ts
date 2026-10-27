// In-game checks of the camp feature's low chair (ADR 0122).
import { type Entity, system } from "@minecraft/server";
import {
  CAMP_TABLE_TYPE,
  CHAIR_FAMILY,
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
  LOW_CHAIR_ITEM,
  LOW_CHAIR_TYPE,
  TEST_CHAIR_HIT_EVENT,
  TEST_DUTCH_OVEN_HIT_EVENT,
  TEST_DUTCH_OVEN_SIMMER_EVENT,
  TEST_FIRE_PIT_EVENT,
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

/** Checks the ground oven's initial state, visual toggle, and three-hit take-back. */
export async function dutchOvenSimmerAndTakeBack(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 14.5 };
  a.dim.runCommand(`summon ${DUTCH_OVEN_TYPE} ${at.x} ${at.y} ${at.z}`);
  const oven = a.dim.getEntities({
    type: DUTCH_OVEN_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!oven) return { pass: false, detail: "Dutch oven not spawned" };
  const items = () =>
    a.dim
      .getEntities({ type: "minecraft:item", location: at, maxDistance: 2 })
      .filter(
        (e) =>
          e.getComponent("minecraft:item")?.itemStack.typeId ===
          DUTCH_OVEN_ITEM,
      );
  try {
    const initial = oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY);
    system.sendScriptEvent(TEST_DUTCH_OVEN_SIMMER_EVENT, oven.id);
    await wait(2);
    const simmering = oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY);
    system.sendScriptEvent(TEST_DUTCH_OVEN_HIT_EVENT, oven.id);
    await wait(2);
    const afterOne = oven.isValid;
    for (let i = 0; i < 2; i++) {
      system.sendScriptEvent(TEST_DUTCH_OVEN_HIT_EVENT, oven.id);
      await wait(2);
    }
    const amount = items().reduce(
      (n, e) => n + (e.getComponent("minecraft:item")?.itemStack.amount ?? 0),
      0,
    );
    return {
      pass:
        initial === false &&
        simmering === true &&
        afterOne &&
        !oven.isValid &&
        amount === 1,
      detail: `initial=${initial} simmering=${simmering} afterOne=${afterOne} afterThree=${oven.isValid} items=${amount}`,
    };
  } finally {
    if (oven.isValid) oven.remove();
    for (const item of items()) item.remove();
  }
}
