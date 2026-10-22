import {
  type Dimension,
  type Entity,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, type Outcome, spawnCar, wait } from "../arena";

const CASES = ["kill", "script", "unload"] as const;
type Case = (typeof CASES)[number];
interface Sample {
  case: Case;
  event: "beforeRemove" | "afterRemove" | "die";
  tick: number;
  id: string;
  typeId: string;
  dimension?: string;
  location?: Vector3;
  chunkLoadedNextTick?: boolean;
  entityNextTick?: boolean | "threw";
  probeTick?: number;
}

const UNLOAD_AREA = "yasu_ride_unload_spike";
const UNLOAD_CENTER = { x: 2008, z: 8 } as const;

// getBlock returns undefined in an unloaded chunk but can also throw
// LocationInUnloadedChunkError, so a throw counts as unloaded.
function blockLoaded(dimension: Dimension, location: Vector3): boolean {
  try {
    return dimension.getBlock(location) !== undefined;
  } catch {
    return false;
  }
}

function entityExists(id: string): boolean | "threw" {
  try {
    return world.getEntity(id) !== undefined;
  } catch {
    return "threw";
  }
}

function yesNo(seen: boolean): string {
  return seen ? "yes" : "no";
}

export async function fleetRemoveSpike(a: Arena): Promise<Outcome> {
  const samples: Sample[] = [];
  const cases = new Map<string, Case>();
  const cars: Entity[] = [];
  const probes = new Set<number>();
  const tag = `yasu_ride_fleet_remove_${system.currentTick}`;
  let error: string | undefined;

  function track(car: Entity, testCase: Case): void {
    cars.push(car);
    cases.set(car.id, testCase);
  }
  function record(
    event: Sample["event"],
    id: string,
    typeId: string,
  ): Sample | undefined {
    const testCase = cases.get(id);
    if (typeId !== ENTITY_TYPE.suv || !testCase) return undefined;
    const sample: Sample = {
      case: testCase,
      event,
      tick: system.currentTick,
      id,
      typeId,
    };
    samples.push(sample);
    return sample;
  }
  function seen(testCase: Case, matches: (s: Sample) => boolean): boolean {
    return samples.some((s) => s.case === testCase && matches(s));
  }

  const before = world.beforeEvents.entityRemove.subscribe((ev) => {
    const car = ev.removedEntity;
    const sample = record("beforeRemove", car.id, car.typeId);
    if (!sample) return;
    // Before events are read-only, so the probes wait for the next tick.
    const dimension = car.dimension;
    const location = { ...car.location };
    sample.dimension = dimension.id;
    sample.location = location;
    const probe = system.run(() => {
      probes.delete(probe);
      sample.probeTick = system.currentTick;
      sample.chunkLoadedNextTick = blockLoaded(dimension, location);
      sample.entityNextTick = entityExists(sample.id);
    });
    probes.add(probe);
  });
  const after = world.afterEvents.entityRemove.subscribe((ev) => {
    record("afterRemove", ev.removedEntityId, ev.typeId);
  });
  const die = world.afterEvents.entityDie.subscribe((ev) => {
    record("die", ev.deadEntity.id, ev.deadEntity.typeId);
  });
  try {
    const killed = spawnCar(a, 5.5, 20.5, 0);
    track(killed, "kill");
    killed.addTag(tag);
    await wait(5);
    a.dim.runCommand(`kill @e[type=${ENTITY_TYPE.suv},tag=${tag}]`);
    await wait(40);

    const removed = spawnCar(a, 5.5, 20.5, 0);
    track(removed, "script");
    removed.remove();
    await wait(20);

    let areaAdded = false;
    try {
      a.dim.runCommand(
        `tickingarea add 2000 -64 0 2015 0 15 ${UNLOAD_AREA} true`,
      );
      areaAdded = true;
      const center = { ...UNLOAD_CENTER, y: a.gy };
      let loaded = blockLoaded(a.dim, center);
      for (let tick = 1; tick < 100 && !loaded; tick++) {
        await wait(1);
        loaded = blockLoaded(a.dim, center);
      }
      if (!loaded)
        throw new Error("unload spike chunk did not load in 100 ticks");
      const top = a.dim.getTopmostBlock(center);
      if (!top) throw new Error("unload spike ground not found");
      const location = { ...center, y: top.location.y + 1 };
      // Summon persists far from players, unlike spawnEntity (0010).
      a.dim.runCommand(
        `summon ${ENTITY_TYPE.suv} ${location.x} ${location.y} ${location.z}`,
      );
      const unloaded = a.dim.getEntities({
        type: ENTITY_TYPE.suv,
        location,
        maxDistance: 1.5,
      })[0];
      if (!unloaded) throw new Error("unload spike car not found");
      track(unloaded, "unload");
      await wait(5);
      a.dim.runCommand(`tickingarea remove ${UNLOAD_AREA}`);
      areaAdded = false;
      for (let tick = 0; tick < 200; tick++) {
        await wait(1);
        if (
          seen("unload", (s) => s.event === "afterRemove") &&
          seen("unload", (s) => s.probeTick !== undefined)
        )
          break;
      }
    } finally {
      if (areaAdded) a.dim.runCommand(`tickingarea remove ${UNLOAD_AREA}`);
    }
  } catch (e) {
    error = String(e);
  } finally {
    world.beforeEvents.entityRemove.unsubscribe(before);
    world.afterEvents.entityRemove.unsubscribe(after);
    world.afterEvents.entityDie.unsubscribe(die);
    for (const probe of probes) system.clearRun(probe);
    for (const car of cars) {
      // An unloaded car stays in the dev world for normal fleet eviction on load.
      if (!car.isValid) continue;
      try {
        car.removeTag(tag);
      } finally {
        car.remove();
      }
    }
  }
  const summary = CASES.map((testCase) => {
    const loadedNextTick = samples
      .filter((s) => s.case === testCase && s.event === "beforeRemove")
      .map((s) => s.chunkLoadedNextTick ?? "pending")
      .join(",");
    const remove = yesNo(seen(testCase, (s) => s.event === "afterRemove"));
    const died = yesNo(seen(testCase, (s) => s.event === "die"));
    return `${testCase}: remove=${remove} die=${died} loadedNextTick=${loadedNextTick || "unobserved"}`;
  });
  return {
    pass:
      error === undefined &&
      seen("kill", (s) => s.chunkLoadedNextTick === true) &&
      seen("unload", (s) => s.chunkLoadedNextTick === false),
    detail: summary.join("; ") + (error ? `; error=${error}` : ""),
    lines: samples.map((s) => JSON.stringify(s)),
  };
}
