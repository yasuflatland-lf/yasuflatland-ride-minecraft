// In-game checks of the camp feature's low chair (ADR 0122).
import { type Entity, system, type Vector3 } from "@minecraft/server";
import { FIRE_PIT_TOP_PX, TABLE_TOP_PX } from "../../domain/camp/spec";
import {
  CAMP_TABLE_ITEM,
  CAMP_TABLE_TYPE,
  CHAIR_KINDS,
  type ChairProfile,
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  FIRE_PIT_COVERED_PROPERTY,
  FIRE_PIT_ITEM,
  FIRE_PIT_LIT_PROPERTY,
  FIRE_PIT_TYPE,
  GAS_LANTERN_ITEM,
  GAS_LANTERN_LIT_PROPERTY,
  GAS_LANTERN_TYPE,
  TEST_DUTCH_OVEN_HIT_EVENT,
  TEST_DUTCH_OVEN_ON_PIT_EVENT,
  TEST_DUTCH_OVEN_ON_TABLE_EVENT,
  TEST_DUTCH_OVEN_SIMMER_EVENT,
  TEST_FIRE_PIT_EVENT,
  TEST_FIRE_PIT_HIT_EVENT,
  TEST_GAS_LANTERN_EVENT,
  TEST_GAS_LANTERN_HIT_EVENT,
  TEST_TABLE_HIT_EVENT,
} from "../../infrastructure/camp/identifiers";
import { type Arena, type Outcome, wait } from "../arena";

// On the arena's east edge, past the camping gear row (z 1-19) and clear of the
// camper park spot (x 103-114, z 73-84) and the camper tank (z 61-69).
const CELL = { x: 119, z: 40 } as const;

const droppedItems = (a: Arena, at: Vector3, itemType: string) =>
  a.dim
    .getEntities({ type: "minecraft:item", location: at, maxDistance: 2 })
    .filter(
      (e) => e.getComponent("minecraft:item")?.itemStack.typeId === itemType,
    );

const totalAmount = (items: Entity[]) =>
  items.reduce(
    (n, e) => n + (e.getComponent("minecraft:item")?.itemStack.amount ?? 0),
    0,
  );

const firePitAt = (a: Arena) => ({
  x: CELL.x + 0.5,
  y: a.gy,
  z: CELL.z + 11.5,
});

const summonFirePit = (a: Arena, at: Vector3): Entity | undefined => {
  a.dim.runCommand(`summon ${FIRE_PIT_TYPE} ${at.x} ${at.y} ${at.z}`);
  return a.dim.getEntities({
    type: FIRE_PIT_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
};

const ovensNear = (a: Arena, at: Vector3) =>
  a.dim.getEntities({ type: DUTCH_OVEN_TYPE, location: at, maxDistance: 2 });

/** Runs a scenario once per chair kind, passing only when every kind passes. */
async function forEveryChairKind(
  scenario: (profile: ChairProfile) => Promise<Outcome>,
): Promise<Outcome> {
  const outcomes: Outcome[] = [];
  for (const profile of Object.values(CHAIR_KINDS))
    outcomes.push(await scenario(profile));
  return {
    pass: outcomes.every((outcome) => outcome.pass),
    detail: outcomes.map((outcome) => outcome.detail).join("; "),
  };
}

/** Summons a chair, checks its one seat, and folds it back with three hits into one dropped item. */
export async function lowChairSeatAndTakeBack(a: Arena): Promise<Outcome> {
  return forEveryChairKind((profile) =>
    lowChairSeatAndTakeBackForKind(a, profile),
  );
}

/** Reports the Noga Chair's seat and fold lifecycle as its own scenario. */
export async function nogaChairSeatAndTakeBack(a: Arena): Promise<Outcome> {
  return lowChairSeatAndTakeBackForKind(a, CHAIR_KINDS.noga_chair);
}

async function lowChairSeatAndTakeBackForKind(
  a: Arena,
  profile: ChairProfile,
): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 0.5 };
  a.dim.runCommand(`summon ${profile.typeId} ${at.x} ${at.y} ${at.z}`);
  const chair = a.dim.getEntities({
    type: profile.typeId,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!chair) return { pass: false, detail: "chair not spawned" };
  const chairItems = () => droppedItems(a, at, profile.itemId);
  const hit = () => system.sendScriptEvent(profile.testHitEvent, chair.id);
  try {
    const seats = chair.getComponent("minecraft:rideable")?.seatCount;
    const family = chair.matches({ families: [profile.family] });
    hit();
    await wait(2);
    const afterOne = chair.isValid;
    hit();
    await wait(2);
    hit();
    await wait(2);
    const afterThree = chair.isValid;
    const amount = totalAmount(chairItems());
    return {
      pass: seats === 1 && family && afterOne && !afterThree && amount === 1,
      detail: `${profile.typeId}: seats=${seats} family=${family} afterOne=${afterOne} afterThree=${afterThree} items=${amount}`,
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
  return forEveryChairKind((profile) =>
    lowChairSettlesThroughGrassForKind(a, profile),
  );
}

async function lowChairSettlesThroughGrassForKind(
  a: Arena,
  profile: ChairProfile,
): Promise<Outcome> {
  const ground = { x: GRASS_CELL.x, y: a.gy - 1, z: GRASS_CELL.z };
  const plant = { ...ground, y: a.gy };
  a.dim.runCommand(`setblock ${ground.x} ${ground.y} ${ground.z} grass_block`);
  a.dim.runCommand(`setblock ${plant.x} ${plant.y} ${plant.z} short_grass`);
  const at = { x: GRASS_CELL.x + 0.5, y: a.gy + 1, z: GRASS_CELL.z + 0.5 };
  a.dim.runCommand(`summon ${profile.typeId} ${at.x} ${at.y} ${at.z}`);
  const chair = a.dim.getEntities({
    type: profile.typeId,
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

/**
 * Confirms that the outside table loads in its family with no seats. The stable
 * Script API cannot read `minecraft:persistent`, so tests/packs/campTable.test.ts
 * checks persistence instead.
 */
export function campTableNoSeats(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 8.5 };
  a.dim.runCommand(`summon ${CAMP_TABLE_TYPE} ${at.x} ${at.y} ${at.z}`);
  const table = a.dim.getEntities({
    type: CAMP_TABLE_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  try {
    const rideable = table?.getComponent("minecraft:rideable");
    const family = table?.matches({ families: ["yasu_ride_camp_table"] });
    return Promise.resolve({
      pass:
        table?.isValid === true && rideable === undefined && family === true,
      detail: `rideable=${rideable !== undefined} family=${family}`,
    });
  } finally {
    if (table?.isValid) table.remove();
  }
}

/** Checks both tabletop spots and the fold guard through production actions. */
export async function dutchOvenOnTable(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x, y: a.gy, z: CELL.z + 8.5 };
  a.dim.runCommand(`summon ${CAMP_TABLE_TYPE} ${at.x} ${at.y} ${at.z}`);
  const table = a.dim.getEntities({
    type: CAMP_TABLE_TYPE,
    location: at,
    maxDistance: 1.5,
  })[0];
  if (!table) return { pass: false, detail: "table not spawned" };
  const hitThree = async (event: string, id: string) => {
    for (let i = 0; i < 3; i++) {
      system.sendScriptEvent(event, id);
      await wait(2);
    }
  };
  try {
    for (const spot of [0, 1, 0]) {
      system.sendScriptEvent(
        TEST_DUTCH_OVEN_ON_TABLE_EVENT,
        `${table.id} ${spot}`,
      );
      await wait(2);
    }
    const ovens = ovensNear(a, at);
    await wait(22);
    const standing =
      ovens.length === 2 &&
      ovens.every(
        (oven) =>
          oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) === false &&
          Math.abs(oven.location.y - (table.location.y + TABLE_TOP_PX / 16)) <
            0.05,
      );
    await hitThree(TEST_TABLE_HIT_EVENT, table.id);
    if (!table.isValid)
      return { pass: false, detail: "table folded with ovens on top" };
    const guarded = totalAmount(droppedItems(a, at, CAMP_TABLE_ITEM)) === 0;
    for (const oven of ovens)
      await hitThree(TEST_DUTCH_OVEN_HIT_EVENT, oven.id);
    const returned =
      totalAmount(droppedItems(a, at, DUTCH_OVEN_ITEM)) === 2 &&
      ovensNear(a, at).length === 0;
    for (let i = 0; i < 2; i++) {
      system.sendScriptEvent(TEST_TABLE_HIT_EVENT, table.id);
      await wait(2);
    }
    const afterTwo = table.isValid;
    system.sendScriptEvent(TEST_TABLE_HIT_EVENT, table.id);
    await wait(2);
    const folded =
      !table.isValid && totalAmount(droppedItems(a, at, CAMP_TABLE_ITEM)) === 1;
    return {
      pass: standing && guarded && returned && afterTwo && folded,
      detail: `ovens=${ovens.length} standing=${standing} guarded=${guarded} returned=${returned} afterTwo=${afterTwo} folded=${folded}`,
    };
  } finally {
    if (table.isValid) table.remove();
    for (const oven of ovensNear(a, at)) oven.remove();
    for (const type of [DUTCH_OVEN_ITEM, CAMP_TABLE_ITEM])
      for (const item of droppedItems(a, at, type)) item.remove();
  }
}

/** Checks the fire pit's initial state and both directions of the ignition toggle. */
export async function firePitIgnition(a: Arena): Promise<Outcome> {
  const at = firePitAt(a);
  const pit = summonFirePit(a, at);
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
  const items = () => droppedItems(a, at, DUTCH_OVEN_ITEM);
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
    const amount = totalAmount(items());
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

/** Covered hits leave the pit intact and do not count toward folding it. */
export async function firePitCoveredTakeBack(a: Arena): Promise<Outcome> {
  const at = firePitAt(a);
  const pit = summonFirePit(a, at);
  if (!pit) return { pass: false, detail: "fire pit not spawned" };
  const items = () => droppedItems(a, at, FIRE_PIT_ITEM);
  try {
    const initial = pit.getProperty(FIRE_PIT_COVERED_PROPERTY);
    system.sendScriptEvent(TEST_DUTCH_OVEN_ON_PIT_EVENT, pit.id);
    await wait(2);
    const covered = pit.getProperty(FIRE_PIT_COVERED_PROPERTY);
    for (let i = 0; i < 3; i++) {
      system.sendScriptEvent(TEST_FIRE_PIT_HIT_EVENT, pit.id);
      await wait(2);
    }
    if (!pit.isValid) return { pass: false, detail: "covered pit folded" };
    const coveredDrops = items().length;
    const oven = ovensNear(a, at)[0];
    if (!oven) return { pass: false, detail: "hosted oven missing" };
    for (let i = 0; i < 3; i++) {
      system.sendScriptEvent(TEST_DUTCH_OVEN_HIT_EVENT, oven.id);
      await wait(2);
    }
    const uncovered = pit.getProperty(FIRE_PIT_COVERED_PROPERTY);
    for (let i = 0; i < 2; i++) {
      system.sendScriptEvent(TEST_FIRE_PIT_HIT_EVENT, pit.id);
      await wait(2);
    }
    const afterTwo = pit.isValid;
    system.sendScriptEvent(TEST_FIRE_PIT_HIT_EVENT, pit.id);
    await wait(2);
    const amount = totalAmount(items());
    return {
      pass:
        initial === false &&
        covered === true &&
        coveredDrops === 0 &&
        uncovered === false &&
        afterTwo &&
        !pit.isValid &&
        amount === 1,
      detail: `initial=${initial} covered=${covered} coveredDrops=${coveredDrops} uncovered=${uncovered} afterTwo=${afterTwo} folded=${!pit.isValid} items=${amount}`,
    };
  } finally {
    if (pit.isValid) pit.remove();
    for (const item of items()) item.remove();
    for (const oven of ovensNear(a, at)) oven.remove();
    for (const item of droppedItems(a, at, DUTCH_OVEN_ITEM)) item.remove();
  }
}

/** Exercises the host lifecycle through the production placement use case without a player. */
export async function dutchOvenOnPit(a: Arena): Promise<Outcome> {
  const folded = await firePitCoveredTakeBack(a);
  if (!folded.pass) return folded;
  const at = firePitAt(a);
  const pit = summonFirePit(a, at);
  if (!pit) return { pass: false, detail: "fire pit not spawned" };
  let oven: Entity | undefined;
  try {
    system.sendScriptEvent(TEST_DUTCH_OVEN_ON_PIT_EVENT, pit.id);
    await wait(4);
    oven = ovensNear(a, at)[0];
    if (!oven) return { pass: false, detail: "oven not placed" };
    const covered = pit.getProperty(FIRE_PIT_COVERED_PROPERTY) === true;
    const simmering = oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) === true;
    await wait(22);
    const standing =
      Math.abs(oven.location.y - (pit.location.y + FIRE_PIT_TOP_PX / 16)) <
      0.05;
    a.dim.runCommand(
      `kill @e[type=${FIRE_PIT_TYPE},x=${at.x},y=${at.y},z=${at.z},r=2]`,
    );
    const settled = () =>
      oven?.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) === false &&
      Math.abs(oven.location.y - a.gy) < 0.05;
    // The host check runs every hostCheckTicks and a busy server stretches it.
    for (let i = 0; i < 120 && !settled(); i++) await wait(1);
    const lidded = oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) === false;
    const fallen = Math.abs(oven.location.y - a.gy) < 0.05;
    return {
      pass: covered && simmering && standing && lidded && fallen,
      detail: `fold=${folded.pass} covered=${covered} simmering=${simmering} standing=${standing} lidded=${lidded} fallen=${fallen} y=${oven.location.y.toFixed(2)}`,
    };
  } finally {
    if (oven?.isValid) oven.remove();
    if (pit.isValid) pit.remove();
  }
}

export async function gasLanternTakeBack(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 17.5 };
  const items = () => droppedItems(a, at, GAS_LANTERN_ITEM);
  let lantern: Entity | undefined;
  try {
    a.dim.runCommand(`summon ${GAS_LANTERN_TYPE} ${at.x} ${at.y} ${at.z}`);
    lantern = a.dim.getEntities({
      type: GAS_LANTERN_TYPE,
      location: at,
      maxDistance: 1.5,
    })[0];
    if (!lantern) return { pass: false, detail: "Gas Lantern not spawned" };
    const initial = lantern.getProperty(GAS_LANTERN_LIT_PROPERTY);
    const family = lantern.getComponent("minecraft:type_family");
    const matchesFamily =
      family?.hasTypeFamily("yasu_ride_gas_lantern") === true &&
      family.hasTypeFamily("inanimate");
    let survived = true;
    for (let i = 0; i < 3; i++) {
      system.sendScriptEvent(TEST_GAS_LANTERN_HIT_EVENT, lantern.id);
      await wait(2);
      if (i < 2) survived &&= lantern.isValid;
    }
    const amount = totalAmount(items());
    return {
      pass:
        initial === false &&
        matchesFamily &&
        survived &&
        !lantern.isValid &&
        amount === 1,
      detail: `initial=${initial} family=${matchesFamily} survived=${survived} afterThree=${lantern.isValid} items=${amount}`,
    };
  } finally {
    if (lantern?.isValid) lantern.remove();
    for (const item of items()) item.remove();
  }
}

export async function gasLanternSwitch(a: Arena): Promise<Outcome> {
  const at = { x: CELL.x + 0.5, y: a.gy, z: CELL.z + 17.5 };
  const cell = { x: Math.floor(at.x), y: at.y, z: Math.floor(at.z) };
  const support = { ...cell, y: cell.y - 1 };
  const previousSupport = a.dim.getBlock(support)?.permutation;
  const lanterns = () =>
    a.dim.getEntities({ type: GAS_LANTERN_TYPE, location: at, maxDistance: 2 });
  const summon = () => {
    a.dim.runCommand(`summon ${GAS_LANTERN_TYPE} ${at.x} ${at.y} ${at.z}`);
    return lanterns()[0];
  };
  const air = () => a.dim.getBlock(cell)?.isAir === true;
  const lit = (entity: Entity) =>
    entity.getProperty(GAS_LANTERN_LIT_PROPERTY) === true &&
    a.dim.getBlock(cell)?.typeId === "minecraft:light_block_15";
  const unlit = (entity: Entity) =>
    entity.getProperty(GAS_LANTERN_LIT_PROPERTY) === false && air();
  try {
    a.dim.getBlock(support)?.setType("minecraft:stone");
    a.dim.getBlock(cell)?.setType("minecraft:air");
    const first = summon();
    if (!first) return { pass: false, detail: "Gas Lantern not spawned" };
    const initial = unlit(first);
    system.sendScriptEvent(TEST_GAS_LANTERN_EVENT, first.id);
    await wait(2);
    const on = lit(first);
    await wait(12);
    system.sendScriptEvent(TEST_GAS_LANTERN_EVENT, first.id);
    await wait(2);
    const off = unlit(first);
    await wait(12);
    system.sendScriptEvent(TEST_GAS_LANTERN_EVENT, first.id);
    await wait(2);
    const onAgain = lit(first);
    a.dim.runCommand(
      `kill @e[type=${GAS_LANTERN_TYPE},x=${at.x},y=${at.y},z=${at.z},r=2]`,
    );
    await wait(25);
    const killed = !first.isValid && air();
    const second = summon();
    if (!second)
      return { pass: false, detail: "second Gas Lantern not spawned" };
    system.sendScriptEvent(TEST_GAS_LANTERN_EVENT, second.id);
    await wait(2);
    const secondOn = lit(second);
    for (let i = 0; i < 3; i++) {
      system.sendScriptEvent(TEST_GAS_LANTERN_HIT_EVENT, second.id);
      await wait(2);
    }
    const takenBack = !second.isValid && air();
    return {
      pass: initial && on && off && onAgain && killed && secondOn && takenBack,
      detail: `initial=${initial} on=${on} off=${off} onAgain=${onAgain} killed=${killed} secondOn=${secondOn} takenBack=${takenBack}`,
    };
  } finally {
    for (const entity of lanterns()) entity.remove();
    for (const item of droppedItems(a, at, GAS_LANTERN_ITEM)) item.remove();
    a.dim.getBlock(cell)?.setType("minecraft:air");
    if (previousSupport)
      a.dim.getBlock(support)?.setPermutation(previousSupport);
  }
}
