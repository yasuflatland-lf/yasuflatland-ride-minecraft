import { type Entity, system, world } from "@minecraft/server";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, type Outcome, spawnCar, wait } from "../arena";

type Case = "kill" | "script" | "unload";
interface Sample {
  case: Case;
  event: "beforeRemove" | "afterRemove" | "die";
  tick: number;
  id: string;
  typeId: string;
  dimension?: string;
  location?: { x: number; y: number; z: number };
  chunkLoadedNextTick?: boolean;
  entityNextTick?: boolean | "threw";
  probeTick?: number;
}

export async function fleetRemoveSpike(a: Arena): Promise<Outcome> {
  const samples: Sample[] = [];
  const cases = new Map<string, Case>();
  const cars: Entity[] = [];
  const probes = new Set<number>();
  const tag = `yasu_ride_fleet_remove_${system.currentTick}`;
  const area = "yasu_ride_unload_spike";
  let areaAdded = false;
  let error: string | undefined;
  const before = world.beforeEvents.entityRemove.subscribe((ev) => {
    const car = ev.removedEntity;
    if (car.typeId !== ENTITY_TYPE.suv) return;
    const testCase = cases.get(car.id);
    if (!testCase) return;
    const dimension = car.dimension;
    const location = { ...car.location };
    const sample: Sample = {
      case: testCase,
      event: "beforeRemove",
      tick: system.currentTick,
      id: car.id,
      typeId: car.typeId,
      dimension: dimension.id,
      location,
    };
    samples.push(sample);
    const probe = system.run(() => {
      probes.delete(probe);
      sample.probeTick = system.currentTick;
      try {
        sample.chunkLoadedNextTick = dimension.getBlock(location) !== undefined;
      } catch {
        sample.chunkLoadedNextTick = false;
      }
      try {
        sample.entityNextTick = world.getEntity(sample.id) !== undefined;
      } catch {
        sample.entityNextTick = "threw";
      }
    });
    probes.add(probe);
  });
  const after = world.afterEvents.entityRemove.subscribe((ev) => {
    if (ev.typeId !== ENTITY_TYPE.suv) return;
    const testCase = cases.get(ev.removedEntityId);
    if (testCase)
      samples.push({
        case: testCase,
        event: "afterRemove",
        tick: system.currentTick,
        id: ev.removedEntityId,
        typeId: ev.typeId,
      });
  });
  const die = world.afterEvents.entityDie.subscribe((ev) => {
    const car = ev.deadEntity;
    if (car.typeId !== ENTITY_TYPE.suv) return;
    const testCase = cases.get(car.id);
    if (testCase)
      samples.push({
        case: testCase,
        event: "die",
        tick: system.currentTick,
        id: car.id,
        typeId: car.typeId,
      });
  });
  try {
    const killed = spawnCar(a, 5.5, 20.5, 0);
    cars.push(killed);
    cases.set(killed.id, "kill");
    killed.addTag(tag);
    await wait(5);
    a.dim.runCommand(`kill @e[type=${ENTITY_TYPE.suv},tag=${tag}]`);
    await wait(40);

    const removed = spawnCar(a, 5.5, 20.5, 0);
    cars.push(removed);
    cases.set(removed.id, "script");
    removed.remove();
    await wait(20);

    try {
      a.dim.runCommand(`tickingarea add 2000 -64 0 2015 0 15 ${area} true`);
      areaAdded = true;
      const center = { x: 2008, y: a.gy, z: 8 };
      let loaded = false;
      for (let tick = 0; tick < 100; tick++) {
        try {
          loaded = a.dim.getBlock(center) !== undefined;
        } catch {
          loaded = false;
        }
        if (loaded) break;
        await wait(1);
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
      cars.push(unloaded);
      cases.set(unloaded.id, "unload");
      await wait(5);
      a.dim.runCommand(`tickingarea remove ${area}`);
      areaAdded = false;
      for (let tick = 0; tick < 200; tick++) {
        await wait(1);
        if (
          samples.some(
            (s) => s.case === "unload" && s.event === "afterRemove",
          ) &&
          samples.some((s) => s.case === "unload" && s.probeTick !== undefined)
        )
          break;
      }
    } finally {
      if (areaAdded) a.dim.runCommand(`tickingarea remove ${area}`);
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
  const summary = (["kill", "script", "unload"] as const).map((testCase) => {
    const seen = samples.filter((s) => s.case === testCase);
    const loaded = seen
      .filter((s) => s.event === "beforeRemove")
      .map((s) => s.chunkLoadedNextTick ?? "pending");
    return `${testCase}: remove=${seen.some((s) => s.event === "afterRemove") ? "yes" : "no"} die=${seen.some((s) => s.event === "die") ? "yes" : "no"} loadedNextTick=${loaded.join(",") || "unobserved"}`;
  });
  return {
    pass:
      error === undefined &&
      samples.some(
        (s) => s.case === "kill" && s.chunkLoadedNextTick === true,
      ) &&
      samples.some(
        (s) => s.case === "unload" && s.chunkLoadedNextTick === false,
      ),
    detail: summary.join("; ") + (error ? `; error=${error}` : ""),
    lines: samples.map((s) => JSON.stringify(s)),
  };
}
