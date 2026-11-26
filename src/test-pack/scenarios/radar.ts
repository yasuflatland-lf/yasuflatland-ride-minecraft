import { type Entity, system } from "@minecraft/server";
import type { RadarReport } from "../../domain/vehicle/navigation/radar";
import { SPEC } from "../../domain/vehicle/spec";
import {
  TEST_RADAR_EVENT,
  TEST_RADAR_RESULT_EVENT,
} from "../../infrastructure/vehicle/testHooks/identifiers";
import { type Arena, wait, waitUntil, withBoat, withCar } from "../arena";
import type { Outcome } from "../outcome";

const VILLAGE_SUV_START = [55.5, 69.5, 0] as const;

async function observeRadar(
  a: Arena,
  car: Entity,
  place: RadarReport["place"],
  mode: "start" | "message" | "passenger" = "start",
): Promise<Outcome> {
  const quiet = mode === "message";
  const monument = place === "ocean_monument";
  const type = monument ? "minecraft:guardian" : "minecraft:villager";
  const name = `radar_${a.lane.index}_${system.currentTick}`;
  const reports: { tick: number; report: RadarReport }[] = [];
  let ready: number | undefined;
  const listener = system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== TEST_RADAR_RESULT_EVENT) return;
    const prefix = `${car.id},`;
    if (!ev.message.startsWith(prefix)) return;
    const split = ev.message.indexOf(",", prefix.length);
    const tick = Number(ev.message.slice(prefix.length, split));
    const payload = ev.message.slice(split + 1);
    if (payload === "ready") ready = tick;
    else reports.push({ tick, report: JSON.parse(payload) as RadarReport });
  });
  try {
    await wait(2);
    system.sendScriptEvent(TEST_RADAR_EVENT, `${car.id},${mode}`);
    if (
      !(await waitUntil(10, () => ready !== undefined)) ||
      ready === undefined
    )
      return { pass: false, detail: "Radar rider did not become ready" };
    const start = system.currentTick;
    const count = monument ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const at = monument
        ? a.xyz(55 + i, a.gy - 1, 85.5)
        : a.xyz(83.5 + i, a.gy, 16.5);
      a.dim.runCommand(`summon ${type} ${name} ${at}`);
    }
    const summoned = a.dim.getEntities({ type, name }).length;
    const deadline = quiet
      ? ready + SPEC.radarQuietTicks + SPEC.radarScanInterval
      : start + 100;
    // Keep listening beyond another quiet period so a duplicate can reach the rider.
    await wait(
      deadline -
        system.currentTick +
        SPEC.radarQuietTicks +
        SPEC.radarScanInterval +
        1,
    );
    const first = reports[0];
    return {
      pass:
        summoned === count &&
        reports.length === 1 &&
        first !== undefined &&
        first.tick >= (quiet ? ready + SPEC.radarQuietTicks : start) &&
        first.tick <= deadline &&
        first.report.place === place &&
        first.report.direction === (monument ? "s" : "ne"),
      detail: `summoned=${summoned} ready=${ready} deadline=${deadline} reports=${JSON.stringify(reports)}`,
    };
  } finally {
    system.afterEvents.scriptEventReceive.unsubscribe(listener);
    for (const mob of a.dim.getEntities({ type, name })) mob.remove();
  }
}

export function suvRadarVillage(a: Arena): Promise<Outcome> {
  return withCar(a, ...VILLAGE_SUV_START, (car) =>
    observeRadar(a, car, "village"),
  );
}

export function suvRadarPassenger(a: Arena): Promise<Outcome> {
  return withCar(a, ...VILLAGE_SUV_START, (car) =>
    observeRadar(a, car, "village", "passenger"),
  );
}

export function suvRadarQuiet(a: Arena): Promise<Outcome> {
  return withCar(a, ...VILLAGE_SUV_START, (car) =>
    observeRadar(a, car, "village", "message"),
  );
}

export async function sportsboatRadarMonument(a: Arena): Promise<Outcome> {
  const pools = [
    a.box(50, a.gy - 1, 1, 60, a.gy - 1, 10),
    a.box(53, a.gy - 1, 83, 58, a.gy - 1, 88),
  ];
  try {
    for (const pool of pools) a.dim.runCommand(`fill ${pool} water`);
    return await withBoat(
      a,
      (boat) => observeRadar(a, boat, "ocean_monument"),
      { x: 55.5, z: 5.5, yaw: 0 },
    );
  } finally {
    for (const pool of pools) a.dim.runCommand(`fill ${pool} stone`);
  }
}
