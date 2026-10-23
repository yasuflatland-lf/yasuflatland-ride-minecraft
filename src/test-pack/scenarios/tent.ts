// In-game checks of the tent entity contract (ADR 0130), and of pitching and
// taking down the tent (ADR 0131).
import { type Entity, ItemStack, system } from "@minecraft/server";
import { TENT_SPEC } from "../../domain/camp/spec";
import {
  TENT_CEILING_BLOCK,
  TENT_FAMILY,
  TENT_FLAP_PROPERTY,
  TENT_ITEM,
  TENT_LANTERN_PROPERTY,
  TENT_TYPE,
  TENT_WALL_BLOCK,
  TEST_TENT_HIT_EVENT,
  TEST_TENT_PITCH_EVENT,
} from "../../infrastructure/camp/identifiers";
import { type Arena, type Outcome, spawnCar, wait } from "../arena";

export async function tentEntityContract(a: Arena): Promise<Outcome> {
  const at = { x: 119.5, y: a.gy + 2, z: 46.5 };
  a.dim.runCommand(`summon ${TENT_TYPE} ${at.x} ${at.y} ${at.z}`);
  const tent = a.dim.getEntities({
    type: TENT_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!tent) return { pass: false, detail: "tent not spawned" };
  try {
    await wait(10);
    const y = tent.location.y;
    const family = tent.matches({ families: [TENT_FAMILY] });
    const inanimate = tent.matches({ families: ["inanimate"] });
    const flaps = Object.values(TENT_FLAP_PROPERTY).map((p) =>
      tent.getProperty(p),
    );
    const lantern = tent.getProperty(TENT_LANTERN_PROPERTY);
    const variant = tent.getComponent("minecraft:variant")?.value;
    tent.applyDamage(5);
    const health = tent.getComponent("minecraft:health")?.currentValue;
    const item = new ItemStack(TENT_ITEM, 1);
    return {
      pass:
        Math.abs(y - at.y) < 0.01 &&
        family &&
        inanimate &&
        flaps.every((v) => v === 0) &&
        lantern === false &&
        variant === 0 &&
        health === 20 &&
        item.typeId === TENT_ITEM,
      detail: `y=${y} family=${family} inanimate=${inanimate} flaps=${flaps} lantern=${lantern} variant=${variant} health=${health} item=${item.typeId}`,
    };
  } finally {
    if (tent.isValid) tent.remove();
  }
}

// The tent strip x 106..114, z 45..58: clear of the chair cells (x 119, z 40..43),
// the camper tank (z 61..69), and the park spot (z 73..84). The pitch message's
// tent faces north (yaw 180), covers x 107..113, z 46..57, and its entity stands
// on the floor at (110, gy, 57).
const STRIP = { minX: 106, maxX: 114, minZ: 45, maxZ: 58 } as const;
const FOOTPRINT = { minX: 107, maxX: 113, minZ: 46, maxZ: 57 } as const;
const PITCH_WAIT_TICKS = 20;

const pitchMessage = (a: Arena) => `110 ${a.gy - 1} 46 0`;

function tentsInStrip(a: Arena): Entity[] {
  return a.dim
    .getEntities({ type: TENT_TYPE })
    .filter(
      (e) =>
        e.location.x >= STRIP.minX &&
        e.location.x <= STRIP.maxX + 1 &&
        e.location.z >= STRIP.minZ &&
        e.location.z <= STRIP.maxZ + 1,
    );
}

function tentBlocksInFootprint(a: Arena): number {
  let n = 0;
  for (let x = FOOTPRINT.minX; x <= FOOTPRINT.maxX; x++)
    for (let y = a.gy; y <= a.gy + 3; y++)
      for (let z = FOOTPRINT.minZ; z <= FOOTPRINT.maxZ; z++) {
        const t = a.dim.getBlock({ x, y, z })?.typeId;
        if (t === TENT_WALL_BLOCK || t === TENT_CEILING_BLOCK) n++;
      }
  return n;
}

/** Pitches the test tent and returns its entity; throws when it is not there within 20 ticks. */
async function pitchTestTent(a: Arena): Promise<Entity> {
  system.sendScriptEvent(TEST_TENT_PITCH_EVENT, pitchMessage(a));
  const at = { x: 110.5, y: a.gy, z: 57.5 };
  for (let t = 0; t < PITCH_WAIT_TICKS; t++) {
    await wait(1);
    const tent = a.dim.getEntities({
      type: TENT_TYPE,
      location: at,
      maxDistance: 0.5,
    })[0];
    const wall = a.dim.getBlock({ x: 110, y: a.gy, z: 49 })?.typeId;
    if (tent && wall === TENT_WALL_BLOCK) return tent;
  }
  throw new Error("tent not pitched");
}

/** Removes every tent and empties the strip above the ground. */
function clearTentStrip(a: Arena): void {
  for (const tent of a.dim.getEntities({ type: TENT_TYPE }))
    if (tent.isValid) tent.remove();
  a.dim.runCommand(
    `fill ${STRIP.minX} ${a.gy} ${STRIP.minZ} ${STRIP.maxX} ${a.gy + 3} ${STRIP.maxZ} air`,
  );
}

function tentItemsNear(a: Arena): Entity[] {
  return a.dim
    .getEntities({
      type: "minecraft:item",
      location: { x: 110.5, y: a.gy, z: 57.5 },
      maxDistance: 3,
    })
    .filter(
      (e) => e.getComponent("minecraft:item")?.itemStack.typeId === TENT_ITEM,
    );
}

export async function tentPitchAndTakeDown(a: Arena): Promise<Outcome> {
  try {
    const tent = await pitchTestTent(a);
    const tents = tentsInStrip(a).length;
    const yaw = Math.abs(tent.getRotation().y);
    const laid = tentBlocksInFootprint(a);
    const stone = { x: 110, y: a.gy, z: 50 };
    a.dim.runCommand(`setblock ${stone.x} ${stone.y} ${stone.z} cobblestone`);
    const id = tent.id;
    for (let i = 0; i < 3; i++) {
      system.sendScriptEvent(TEST_TENT_HIT_EVENT, id);
      await wait(2);
    }
    const left = tentsInStrip(a).length;
    const after = tentBlocksInFootprint(a);
    const kept = a.dim.getBlock(stone)?.typeId;
    const items = tentItemsNear(a).reduce(
      (n, e) => n + (e.getComponent("minecraft:item")?.itemStack.amount ?? 0),
      0,
    );
    return {
      pass:
        tents === 1 &&
        yaw === 180 &&
        laid === 137 &&
        left === 0 &&
        after === 0 &&
        kept === "minecraft:cobblestone" &&
        items === 1,
      detail: `tents=${tents} yaw=${yaw} laid=${laid} left=${left} after=${after} kept=${kept} items=${items}`,
    };
  } finally {
    for (const item of tentItemsNear(a)) item.remove();
    clearTentStrip(a);
  }
}

/** Sends the pitch message and reports what stands in the strip a few ticks later. */
async function refusedPitch(
  a: Arena,
): Promise<{ tents: number; laid: number }> {
  system.sendScriptEvent(TEST_TENT_PITCH_EVENT, pitchMessage(a));
  await wait(5);
  return { tents: tentsInStrip(a).length, laid: tentBlocksInFootprint(a) };
}

export async function tentRefuseStep(a: Arena): Promise<Outcome> {
  try {
    a.dim.runCommand(`setblock 110 ${a.gy} 50 stone`);
    const { tents, laid } = await refusedPitch(a);
    return {
      pass: tents === 0 && laid === 0,
      detail: `tents=${tents} laid=${laid}`,
    };
  } finally {
    clearTentStrip(a);
  }
}

export async function tentRefuseVehicleSpace(a: Arena): Promise<Outcome> {
  const car = spawnCar(a, 110.5, 50.5, 0);
  try {
    await wait(2);
    const { tents } = await refusedPitch(a);
    return { pass: tents === 0, detail: `tents=${tents}` };
  } finally {
    if (car.isValid) car.remove();
    clearTentStrip(a);
  }
}

export async function tentRelayLostCell(a: Arena): Promise<Outcome> {
  try {
    await pitchTestTent(a);
    const wall = { x: 113, y: a.gy, z: 50 };
    const before = a.dim.getBlock(wall)?.typeId;
    a.dim.runCommand(`setblock ${wall.x} ${wall.y} ${wall.z} air`);
    const lost = a.dim.getBlock(wall)?.typeId;
    await wait(TENT_SPEC.cellRecheckTicks + 2);
    const after = a.dim.getBlock(wall)?.typeId;
    return {
      pass:
        before === TENT_WALL_BLOCK &&
        lost === "minecraft:air" &&
        after === TENT_WALL_BLOCK,
      detail: `before=${before} lost=${lost} after=${after}`,
    };
  } finally {
    clearTentStrip(a);
  }
}
