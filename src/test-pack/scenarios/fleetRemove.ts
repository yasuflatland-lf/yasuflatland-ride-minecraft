import { type Entity, system } from "@minecraft/server";
import { SPEC } from "../../domain/vehicle/spec";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, blockLoaded, spawnCar, wait, waitUntil } from "../arena";
import { UNLOAD_AREA } from "../lane";
import type { Outcome } from "../outcome";

// The far car and its area stay in world coordinates outside every lane area;
// even lane 7's area ends at x = 1256.
const UNLOAD_CENTER = { x: 2008, z: 8 } as const;
const AREA_LOAD_TICKS = 200;
const REMOVE_TICKS = 200;
// The main pack admits a summoned car on its spawn event, a tick or two later.
const SPAWN_SEEN_TICKS = 5;
const EVICT_TICKS = 20;
// /kill raises the death event about 21 ticks before the removal (ADR 0125).
const KILL_TO_REMOVE_TICKS = 40;

function addUnloadArea(a: Arena): void {
  a.dim.runCommand(`tickingarea add 2000 -64 0 2015 0 15 ${UNLOAD_AREA} true`);
}

function removeUnloadArea(a: Arena): void {
  a.dim.runCommand(`tickingarea remove ${UNLOAD_AREA}`);
}

function taggedCars(a: Arena, tag: string): Entity[] {
  return a.dim.getEntities({ type: ENTITY_TYPE.suv, tags: [tag] });
}

// Reloads the far car to remove it, so it does not stay in the dev world.
async function removeFarCar(a: Arena, tag: string): Promise<string> {
  addUnloadArea(a);
  try {
    const center = { ...UNLOAD_CENTER, y: a.gy };
    if (!(await waitUntil(AREA_LOAD_TICKS, () => blockLoaded(a.dim, center)))) {
      return `far car left in an unloaded chunk: area did not load in ${AREA_LOAD_TICKS} ticks`;
    }
    const cars = taggedCars(a, tag);
    for (const car of cars) car.remove();
    return `far car removed: ${cars.length}`;
  } finally {
    removeUnloadArea(a);
  }
}

/**
 * The fleet forgets a car removed from a loaded chunk and keeps one whose chunk
 * unloaded (ADR 0125). The test pack cannot read the main pack's fleet, so it
 * watches the eviction of loaded unowned cars as vehicle_limit does (ADR 0066).
 */
export async function fleetForget(a: Arena): Promise<Outcome> {
  const n = SPEC.maxUnownedVehicles;
  const cars: Entity[] = [];
  const lines: string[] = [];
  const farTag = `yasu_ride_fleet_far_${system.currentTick}`;
  const killTag = `yasu_ride_fleet_kill_${system.currentTick}`;
  let areaAdded = false;
  let farSummoned = false;
  const spawnAt = (i: number) => {
    cars.push(spawnCar(a, 60.5 + (i % 6) * 6, 30.5 + Math.floor(i / 6) * 6, 0));
  };
  try {
    for (let i = 0; i < n - 1; i++) spawnAt(i);

    addUnloadArea(a);
    areaAdded = true;
    const center = { ...UNLOAD_CENTER, y: a.gy };
    if (!(await waitUntil(AREA_LOAD_TICKS, () => blockLoaded(a.dim, center)))) {
      throw new Error(`far area did not load in ${AREA_LOAD_TICKS} ticks`);
    }
    const top = a.dim.getTopmostBlock(center);
    if (!top) throw new Error("far ground not found");
    const location = { ...center, y: top.location.y + 1 };
    // Summon persists far from players, unlike spawnEntity (0010).
    a.dim.runCommand(
      `summon ${ENTITY_TYPE.suv} ${location.x} ${location.y} ${location.z}`,
    );
    const far = a.dim.getEntities({
      type: ENTITY_TYPE.suv,
      location,
      maxDistance: 1.5,
    })[0];
    if (!far) throw new Error("far car not spawned");
    far.addTag(farTag);
    farSummoned = true;
    await wait(SPAWN_SEEN_TICKS);

    removeUnloadArea(a);
    areaAdded = false;
    if (!(await waitUntil(REMOVE_TICKS, () => !far.isValid))) {
      throw new Error(`far car did not unload in ${REMOVE_TICKS} ticks`);
    }
    spawnAt(n - 1);
    await wait(EVICT_TICKS);
    const [c0, ...rest] = cars;
    const unloadKept = !c0?.isValid && rest.every((c) => c.isValid);

    const killed = cars[Math.floor(n / 2)];
    if (!killed) throw new Error("no car to kill");
    killed.addTag(killTag);
    a.dim.runCommand(`kill @e[type=${ENTITY_TYPE.suv},tag=${killTag}]`);
    if (!(await waitUntil(REMOVE_TICKS, () => !killed.isValid))) {
      throw new Error(`killed car still valid after ${REMOVE_TICKS} ticks`);
    }
    await wait(KILL_TO_REMOVE_TICKS);
    spawnAt(n);
    await wait(EVICT_TICKS);
    const killFreed = cars.every((c) => c === c0 || c === killed || c.isValid);
    const valid = cars.filter((c) => c.isValid).length;
    return {
      pass: unloadKept && killFreed,
      detail: `unloadKept=${unloadKept} killFreed=${killFreed} valid=${valid}`,
      lines,
    };
  } catch (e) {
    return { pass: false, detail: `error=${String(e)}`, lines };
  } finally {
    for (const car of cars) if (car.isValid) car.remove();
    if (areaAdded) removeUnloadArea(a);
    if (farSummoned) lines.push(await removeFarCar(a, farTag));
  }
}
