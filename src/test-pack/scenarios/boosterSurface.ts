import {
  type Entity,
  type ScriptEventCommandMessageAfterEvent,
  system,
} from "@minecraft/server";
import { length } from "../../domain/shared/vec";
import { SPORTSBOAT_SPEC } from "../../domain/vehicle/kinds/sportsboat/spec";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import {
  TEST_BOOST_EVENT,
  TEST_BOOST_RESULT_EVENT,
} from "../../infrastructure/vehicle/testHooks/identifiers";
import {
  type Arena,
  drive,
  POOL,
  wait,
  waitUntil,
  withBoat,
  withCar,
  withPool,
} from "../arena";
import type { Outcome } from "../outcome";
import { vehicleForm } from "./shared";

import { boostSpecs, type FlyingKind } from "./support/boosterRunway";

async function boostResult(
  car: Entity,
  request: string,
): Promise<string | undefined> {
  let result: string | undefined;
  const listener = (ev: ScriptEventCommandMessageAfterEvent) => {
    if (ev.id !== TEST_BOOST_RESULT_EVENT) return;
    const [id, value] = ev.message.split(",");
    if (id === car.id) result = value;
  };
  system.afterEvents.scriptEventReceive.subscribe(listener);
  try {
    system.sendScriptEvent(TEST_BOOST_EVENT, `${car.id},${request}`);
    await waitUntil(10, () => result !== undefined);
    return result;
  } finally {
    system.afterEvents.scriptEventReceive.unsubscribe(listener);
  }
}

async function cruise(car: Entity, target: number): Promise<Outcome> {
  const speeds: number[] = [];
  for (let tick = 0; tick < 8; tick++) {
    await wait(1);
    speeds.push(length(car.getVelocity()));
  }
  return {
    pass: speeds.every((v) => Math.abs(v - target) <= target * 0.05),
    detail: `target=${target.toFixed(3)} speed=${speeds.map((v) => v.toFixed(3)).join(",")}`,
  };
}

async function boostSurface(a: Arena, kind: FlyingKind): Promise<Outcome> {
  const spec = boostSpecs[kind];
  const run = (water: boolean) =>
    withCar(
      a,
      10.5,
      25.5,
      -90,
      async (car) => {
        const top = a.gy + 6;
        if (water) {
          const y = kind === "scooter" ? top - spec.floatDraft : a.gy + 1;
          car.teleport({ ...car.location, y });
        }
        drive(car, 0, 0);
        await wait(5);
        const enabled = await boostResult(car, "on,report");
        const target = water
          ? Math.min(spec.maxSpeed, spec.maxWaterSpeed)
          : spec.maxSpeed;
        drive(car, 0, 1);
        await wait(Math.ceil(target / spec.accel) + 7);
        const speed = await cruise(car, target);
        const depth = water ? top - car.location.y : 0;
        const submerged = kind !== "scooter";
        const form = vehicleForm(car);
        const onSurface =
          water && !submerged ? Math.abs(depth - spec.floatDraft) <= 0.1 : true;
        return {
          pass:
            enabled === "on" &&
            speed.pass &&
            form === (water && submerged ? "submarine" : "car") &&
            onSurface &&
            (!water || !submerged || depth >= spec.carHeight),
          detail: `boost=${enabled} form=${form} depth=${depth.toFixed(2)} ${speed.detail}`,
        };
      },
      ENTITY_TYPE[kind],
    );
  const ground = await run(false);
  // The flat world's ground is too shallow for the camper to enter submarine form.
  const tank = a.box(5, a.gy, 20, 88, a.gy + 5, 31);
  try {
    a.dim.runCommand(`fill ${tank} glass`);
    a.dim.runCommand(`fill ${a.box(6, a.gy, 21, 87, a.gy + 5, 30)} water`);
    const water = await run(true);
    return {
      pass: ground.pass && water.pass,
      detail: `ground [${ground.detail}] water [${water.detail}]`,
    };
  } finally {
    a.dim.runCommand(`fill ${tank} air`);
  }
}

export function suvBoostSurface(a: Arena): Promise<Outcome> {
  return boostSurface(a, "suv");
}

export function camperBoostSurface(a: Arena): Promise<Outcome> {
  return boostSurface(a, "camper");
}

export function scooterBoostSurface(a: Arena): Promise<Outcome> {
  return boostSurface(a, "scooter");
}

export function bulldozerBoostSurface(a: Arena): Promise<Outcome> {
  return boostSurface(a, "bulldozer");
}

export function sportsboatBoostUnavailable(a: Arena): Promise<Outcome> {
  return withPool(a, 3, async () => {
    const target = SPORTSBOAT_SPEC.maxSpeed;
    const cruiseTick = Math.ceil(target / SPORTSBOAT_SPEC.accel) + 3;
    const run = (request: "seat" | "use") =>
      withBoat(
        a,
        async (boat) => {
          drive(boat, 0, 0);
          await wait(10);
          const message = await boostResult(boat, request);
          const speeds: number[] = [];
          drive(boat, 0, 1);
          for (let tick = 0; tick < cruiseTick + 12; tick++) {
            await wait(1);
            speeds.push(length(boat.getVelocity()));
          }
          const cruise = speeds.slice(cruiseTick);
          const mean =
            cruise.reduce((sum, value) => sum + value, 0) / cruise.length;
          return { message, speeds, mean };
        },
        { x: POOL.minX + 5.5, z: POOL.minZ + 2.5, yaw: 0 },
      );
    const baseline = await run("seat");
    const attempted = await run("use");
    const maxDelta = Math.max(
      ...baseline.speeds.map((v, i) =>
        Math.abs(v - (attempted.speeds[i] ?? Number.NaN)),
      ),
    );
    return {
      pass:
        baseline.message === "ready" &&
        attempted.message === "boost_unavailable" &&
        Math.abs(baseline.mean - target) <= target * 0.05 &&
        Math.abs(attempted.mean - target) <= target * 0.05 &&
        maxDelta <= target * 0.05,
      detail: `control=${baseline.message} message=${attempted.message} normalCruise=${baseline.mean.toFixed(3)} attemptedCruise=${attempted.mean.toFixed(3)} maxTickDelta=${maxDelta.toFixed(3)}`,
    };
  });
}
