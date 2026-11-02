import { type Entity, system } from "@minecraft/server";
import { entranceWorld } from "../../domain/camp/roofTent/access";
import { PAINTS } from "../../domain/shared/paint";
import { CAMPER_PROFILE } from "../../domain/vehicle/kinds/camper/profile";
import { SUV_PROFILE } from "../../domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../domain/vehicle/kinds/suv/spec";
import {
  ROOF_TENT_FAMILY,
  ROOF_TENT_ITEM,
  ROOF_TENT_LADDER_PROPERTY,
  ROOF_TENT_OCCUPIED_PROPERTY,
  ROOF_TENT_TYPE,
  TEST_ROOF_TENT_DRIVER_SEAT_EVENT,
  TEST_ROOF_TENT_HIT_EVENT,
  TEST_ROOF_TENT_HOST_REMOVE_EVENT,
  TEST_ROOF_TENT_OCCUPANT_SEAT_EVENT,
  TEST_ROOF_TENT_PLACE_EVENT,
} from "../../infrastructure/camp/identifiers";
import { PAINT_VARIANT, paintEvent } from "../../infrastructure/shared/dyes";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, spawnCar, wait } from "../arena";
import { type Outcome, runCourse, type StepSink } from "../outcome";
import { summonCow } from "./shared";

// Mirror roof_tent.se.json suv_bounds for the ladder variant.
const SUV_BOUNDS_HALF_WIDTH = 2;
const SUV_BOUNDS_HALF_HEIGHT = 0.85;

// Clear of the camp fixtures and the parked camper; all queries stay in this lane.
const SPOT = { x: 80.5, z: 40.5 };
const near = (a: Arena, type: string) =>
  a.dim.getEntities({
    type,
    location: a.at(SPOT.x, a.gy, SPOT.z),
    maxDistance: 12,
  });
const tents = (a: Arena) => near(a, ROOF_TENT_TYPE);
const drops = (a: Arena) =>
  near(a, "minecraft:item").filter(
    (entity) =>
      entity.getComponent("minecraft:item")?.itemStack.typeId ===
      ROOF_TENT_ITEM,
  );
const returned = (a: Arena) =>
  drops(a).reduce(
    (sum, entity) =>
      sum + (entity.getComponent("minecraft:item")?.itemStack.amount ?? 0),
    0,
  );
async function send(event: string, message: string, ticks = 5): Promise<void> {
  system.sendScriptEvent(event, message);
  await wait(ticks);
}
function contract(tent: Entity, ladder: boolean): boolean {
  const { extent } = tent.getAABB();
  return (
    tent.matches({ families: [ROOF_TENT_FAMILY, "inanimate"] }) &&
    tent.getComponent("minecraft:health")?.currentValue === 20 &&
    tent.getComponent("minecraft:variant") !== undefined &&
    tent.getComponent("minecraft:rideable") === undefined &&
    tent.getProperty(ROOF_TENT_LADDER_PROPERTY) === ladder &&
    Math.abs(extent.x - (ladder ? SUV_BOUNDS_HALF_WIDTH : 1)) < 0.01 &&
    Math.abs(extent.z - (ladder ? SUV_BOUNDS_HALF_WIDTH : 1)) < 0.01 &&
    Math.abs(extent.y - (ladder ? SUV_BOUNDS_HALF_HEIGHT : 0.6)) < 0.01
  );
}
function clean(a: Arena): void {
  for (const entity of [...tents(a), ...drops(a)]) entity.remove();
}

async function hosted(a: Arena, camper: boolean): Promise<Outcome> {
  const host = spawnCar(
    a,
    SPOT.x,
    SPOT.z,
    0,
    camper ? ENTITY_TYPE.camper : ENTITY_TYPE.suv,
  );
  let cow: Entity | undefined;
  try {
    await wait(5);
    await send(TEST_ROOF_TENT_PLACE_EVENT, host.id);
    const tent = tents(a)[0];
    if (!tent) return { pass: false, detail: "roof tent not placed" };
    const mount = (camper ? CAMPER_PROFILE : SUV_PROFILE).roofTent;
    const onRoof =
      mount !== undefined &&
      Math.abs(tent.location.y - host.location.y - mount.roofHeight) < 0.05 &&
      Math.abs(tent.location.x - host.location.x - mount.anchor.x) < 0.05 &&
      Math.abs(tent.location.z - host.location.z - mount.anchor.z) < 0.05;
    let leftOverhang = true;
    let rightFlush = true;
    let footOutside = true;
    if (!camper) {
      leftOverhang = false;
      rightFlush = false;
      footOutside = false;
      if (mount) {
        const shellHalf = 1.2 * SUV_SPEC.bodyHalfWidth;
        leftOverhang =
          mount.anchor.x + shellHalf > SUV_SPEC.bodyHalfWidth + 0.05;
        rightFlush =
          Math.abs(mount.anchor.x - shellHalf + SUV_SPEC.bodyHalfWidth) < 0.05;
        const foot = entranceWorld(mount, {
          location: host.location,
          yaw: host.getRotation().y,
        });
        const { center, extent } = host.getAABB();
        const dx = Math.max(0, Math.abs(foot.x - center.x) - extent.x);
        const dz = Math.max(0, Math.abs(foot.z - center.z) - extent.z);
        footOutside = Math.hypot(dx, dz) >= 0.9;
      }
    }
    const valid = contract(tent, !camper);
    await send(TEST_ROOF_TENT_PLACE_EVENT, host.id);
    const refused = tents(a).length === 1 && tents(a)[0]?.id === tent.id;
    cow = summonCow(a, SPOT.x + 6, SPOT.z);
    if (!cow) return { pass: false, detail: "cow not summoned" };
    cow.addEffect("slowness", 200, { amplifier: 255, showParticles: false });
    let seated: boolean;
    let outside = true;
    if (camper) {
      await send(TEST_ROOF_TENT_OCCUPANT_SEAT_EVENT, `${tent.id} ${cow.id}`, 2);
      seated =
        tent.getProperty(ROOF_TENT_OCCUPIED_PROPERTY) === true &&
        Math.hypot(
          cow.location.x - tent.location.x,
          cow.location.z - tent.location.z,
        ) < 1 &&
        cow.location.y >= tent.location.y - 0.6;
      const bounds = host.getAABB();
      await send(TEST_ROOF_TENT_HOST_REMOVE_EVENT, host.id, 8);
      outside =
        cow.isValid &&
        Math.abs(cow.location.y - a.gy) < 0.2 &&
        !host.isValid &&
        (Math.abs(cow.location.x - bounds.center.x) > bounds.extent.x ||
          Math.abs(cow.location.z - bounds.center.z) > bounds.extent.z);
    } else {
      await send(TEST_ROOF_TENT_DRIVER_SEAT_EVENT, `${host.id} ${cow.id}`, 8);
      // Only players can ride the SUV, so the hook registers the cow as the
      // driver; the host rule and the returned item are what this verifies.
      seated = cow.isValid;
    }
    const gone = !tent.isValid && tents(a).length === 0;
    const items = returned(a);
    return {
      pass:
        onRoof &&
        leftOverhang &&
        rightFlush &&
        footOutside &&
        valid &&
        refused &&
        seated &&
        outside &&
        gone &&
        items === 1,
      detail: `roof=${onRoof}${camper ? "" : ` leftOverhang=${leftOverhang} rightFlush=${rightFlush} footOutside=${footOutside}`} contract=${valid} duplicateRefused=${refused} seated=${seated} outside=${outside} gone=${gone} items=${items}`,
    };
  } finally {
    if (cow?.isValid) cow.remove();
    clean(a);
    if (host.isValid) host.remove();
    await wait(2);
    clean(a);
  }
}

async function ground(a: Arena): Promise<Outcome> {
  try {
    await send(
      TEST_ROOF_TENT_PLACE_EVENT,
      `${a.xyz(Math.floor(SPOT.x), a.gy - 1, Math.floor(SPOT.z))} 0`,
    );
    const tent = tents(a)[0];
    if (!tent) return { pass: false, detail: "ground tent not placed" };
    const valid =
      contract(tent, false) && Math.abs(tent.location.y - a.gy) < 0.01;
    const wrong: string[] = [];
    for (const paint of [...PAINTS.slice(1), PAINTS[0]]) {
      tent.triggerEvent(paintEvent(paint));
      await wait(1);
      if (
        tent.getComponent("minecraft:variant")?.value !== PAINT_VARIANT[paint]
      )
        wrong.push(paint);
    }
    const fixed = contract(tent, false);
    await send(TEST_ROOF_TENT_HIT_EVENT, tent.id, 2);
    const afterOne = tent.isValid && returned(a) === 0;
    await send(TEST_ROOF_TENT_HIT_EVENT, tent.id, 2);
    const afterTwo = tent.isValid && returned(a) === 0;
    await send(TEST_ROOF_TENT_HIT_EVENT, tent.id, 2);
    const gone = !tent.isValid && tents(a).length === 0;
    const items = returned(a);
    return {
      pass:
        valid &&
        fixed &&
        wrong.length === 0 &&
        afterOne &&
        afterTwo &&
        gone &&
        items === 1,
      detail: `contract=${valid} fixed=${fixed} wrongPaints=${wrong} afterOne=${afterOne} afterTwo=${afterTwo} gone=${gone} items=${items}`,
    };
  } finally {
    clean(a);
  }
}

export function roofTentCourse(a: Arena, onStep: StepSink): Promise<Outcome> {
  return runCourse(
    [
      { name: "suv_driver", run: () => hosted(a, false) },
      { name: "camper_removal_ejects", run: () => hosted(a, true) },
      { name: "ground_paint_fold", run: () => ground(a) },
    ],
    { stopOnFail: false, onStep },
  );
}
