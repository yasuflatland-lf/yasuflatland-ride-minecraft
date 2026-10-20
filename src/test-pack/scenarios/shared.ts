// Checks shared by the SUV and camper scenarios. Each takes the kind's spec
// values as parameters, so this file names no kind's spec.
import type { Entity } from "@minecraft/server";
import { length } from "../../domain/shared/vec";
import type { SUV_ENTITY } from "../../domain/vehicle/kinds/suv/entity";
import { type Form, isForm } from "../../domain/vehicle/motion/forms";
import { entityPropertyId } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, drive, type Outcome, wait } from "../arena";

export function suvProperty(
  car: Entity,
  name: keyof typeof SUV_ENTITY.properties,
): ReturnType<Entity["getProperty"]> {
  return car.getProperty(entityPropertyId(name));
}

export function vehicleForm(car: Entity): Form | undefined {
  const form = suvProperty(car, "form");
  return isForm(form) ? form : undefined;
}

/** Two Jump presses 4 ticks apart (ADR 0021). */
async function doubleTap(car: Entity): Promise<void> {
  for (let i = 0; i < 2; i++) {
    drive(car, 0, 0, true);
    await wait(2);
    drive(car, 0, 0, false);
    await wait(2);
  }
}

/**
 * Ticks until the horizontal speed first reaches `fraction` of `maxSpeed`, or
 * -1. It keeps driving until `done()` or `limit` ticks even after the speed is
 * reached, so the caller can check where the vehicle ended up (accel_and_step1
 * checks that it climbed the step at the end of its lane).
 */
export async function ticksToReach(
  car: Entity,
  fraction: number,
  maxSpeed: number,
  limit: number,
  done: () => boolean,
): Promise<number> {
  let reach = -1;
  for (let t = 0; t < limit; t++) {
    await wait(1);
    if (reach < 0 && length(car.getVelocity()) >= maxSpeed * fraction)
      reach = t;
    if (done()) break;
  }
  return reach;
}

/** Takes off with a double tap and waits until the takeoff has finished (ADR 0021). */
export async function takeOff(
  car: Entity,
  takeoffTicks: number,
): Promise<void> {
  await doubleTap(car);
  await wait(takeoffTicks + 5);
}

/** The hover check shared by flight_takeoff and camper_takeoff. */
export function takeoffOutcome(a: Arena, car: Entity): Outcome {
  const form = vehicleForm(car);
  const rise = car.location.y - a.gy;
  return {
    pass: form === "hover" && rise >= 1.2 && rise <= 1.8,
    detail: `form=${form} rise=${rise.toFixed(2)}`,
  };
}

/**
 * Climbs, taps down, and checks that the gear came down no higher than
 * `gearDownHeight` and that the vehicle landed (flight_land, camper_land).
 */
export async function gearDownLandingOutcome(
  a: Arena,
  car: Entity,
  gearDownHeight: number,
): Promise<Outcome> {
  // Climb well above gearDownHeight so the wheels have to wait for the ground.
  drive(car, 0, 0, true);
  await wait(15);
  drive(car, 0, 0, false);
  await wait(2);
  await doubleTap(car);
  const afterTap = vehicleForm(car);
  let gearY = Number.NaN;
  let landedAt = -1;
  for (let t = 0; t < 80; t++) {
    await wait(1);
    if (Number.isNaN(gearY) && suvProperty(car, "gear_down") === true)
      gearY = car.location.y - a.gy;
    if (vehicleForm(car) === "car") {
      landedAt = t;
      break;
    }
  }
  const restY = car.location.y - a.gy;
  // Gravity must be back on: a hop up has to come down again.
  car.applyImpulse({ x: 0, y: 0.5, z: 0 });
  await wait(40);
  const afterHop = car.location.y - a.gy;
  return {
    pass:
      afterTap === "landing" &&
      landedAt >= 0 &&
      gearY >= 2 &&
      gearY <= gearDownHeight + 0.5 &&
      Math.abs(restY) <= 0.1 &&
      Math.abs(afterHop) <= 0.1,
    detail: `afterTap=${afterTap} gearY=${gearY.toFixed(2)} landedAt=${landedAt} restY=${restY.toFixed(2)} afterHop=${afterHop.toFixed(2)}`,
  };
}

export function summonCow(a: Arena, x: number, z: number): Entity | undefined {
  // Mobs from spawnEntity far from players despawn at once, so use summon.
  a.dim.runCommand(`summon minecraft:cow ${x} ${a.gy} ${z}`);
  return a.dim.getEntities({
    type: "minecraft:cow",
    location: { x, y: a.gy, z },
    maxDistance: 2,
  })[0];
}

export const FLIGHT_LANE = { x: 5.5, z: 4.5 } as const;

/** Ticks until the vehicle form reads `form`, or -1 after `limit` ticks. */
export async function ticksUntilForm(
  car: Entity,
  form: Form,
  limit: number,
): Promise<number> {
  for (let t = 0; t < limit; t++) {
    await wait(1);
    if (vehicleForm(car) === form) return t;
  }
  return -1;
}
