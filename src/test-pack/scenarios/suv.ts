import type { Entity } from "@minecraft/server";
import { PAINTS } from "../../domain/shared/paint";
import { dot, forward, length, type Vec2 } from "../../domain/shared/vec";
import { SUV_PROFILE } from "../../domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../domain/vehicle/kinds/suv/spec";
import { headlightCells } from "../../domain/vehicle/lighting/headlights";
import type { Form } from "../../domain/vehicle/motion/forms";
import { nearestSeat, toLocal } from "../../domain/vehicle/seats";
import { SPEC } from "../../domain/vehicle/spec";
import { PAINT_VARIANT, paintEvent } from "../../infrastructure/shared/dyes";
import { LIGHT_BLOCK } from "../../infrastructure/shared/lightBlocks";
import { HEADLIGHTS_PROPERTY } from "../../infrastructure/vehicle/bedrock/identifiers";
import {
  type Arena,
  clearInput,
  drive,
  insideArena,
  POOL,
  SEAT_PROBE,
  spawnCar,
  wait,
  withCar,
  withPool,
} from "../arena";
import { type Outcome, runCourse, type Step, type StepSink } from "../outcome";
import { hitTick, judgeRam, PUSH_WINDOW, type RamSample } from "../ramJudge";
import {
  FLIGHT_PATH,
  gearDownLandingOutcome,
  summonCow,
  suvProperty,
  takeOff,
  takeoffOutcome,
  ticksToReach,
  ticksUntilForm,
  vehicleForm,
} from "./shared";

function slipAngleDeg(v: Vec2, yaw: number): number {
  const cos = dot(v, forward(yaw)) / length(v);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

export function accelAndStep1(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`fill ${a.box(60, a.gy, 15, 70, a.gy, 25)} stone`);
  return withCar(a, 5.5, 20.5, -90, async (car) => {
    drive(car, 0, 1);
    const reach = await ticksToReach(
      car,
      0.95,
      SUV_SPEC.maxSpeed,
      200,
      () => a.local(car.location).x > 63,
    );
    const climbed = car.location.y >= a.gy + 0.9;
    // The tick the input takes effect shifts by 0 or 1 depending on pack run
    // order, so the 45-tick target gets one tick of slack.
    return {
      pass: reach >= 0 && reach <= 46 && climbed,
      detail: `reach95=${reach} climbed=${climbed}`,
    };
  });
}

// Carpets and torches have no collision box, so the step look-ahead must not
// jump for them (ADR 0035).
export function passableNoHop(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`fill ${a.box(30, a.gy, 25, 34, a.gy, 28)} white_carpet`);
  a.dim.runCommand(`fill ${a.box(40, a.gy, 25, 40, a.gy, 28)} torch`);
  return withCar(a, 5.5, 26.5, -90, async (car) => {
    drive(car, 0, 1);
    let maxRise = 0;
    for (let t = 0; t < 120; t++) {
      await wait(1);
      maxRise = Math.max(maxRise, car.location.y - a.gy);
      if (a.local(car.location).x > 45) break;
    }
    const passed = a.local(car.location).x > 45;
    return {
      pass: passed && maxRise < 0.2,
      detail: `passed=${passed} maxRise=${maxRise.toFixed(2)}`,
    };
  });
}

export async function turnAndHandbrake(a: Arena): Promise<Outcome> {
  function measureTurn(
    handbrake: boolean,
  ): Promise<{ maxSlip: number; maxSpeed: number; inside: boolean }> {
    // A left turn heads toward -z, so start near the +z edge: the grip run
    // drifts about 19 blocks sideways, and leaving the floor or the ticking
    // area would change the slip.
    return withCar(a, 5.5, 37.5, -90, async (car) => {
      drive(car, 0, 1);
      await wait(45);
      drive(car, 1, 1, handbrake);
      let maxSlip = 0;
      let maxSpeed = 0;
      let inside = true;
      for (let t = 0; t < 20; t++) {
        await wait(1);
        inside &&= insideArena(a.local(car.location), SUV_SPEC.bodyHalfWidth);
        const v = car.getVelocity();
        const speed = length(v);
        maxSpeed = Math.max(maxSpeed, speed);
        if (speed > 0.02) {
          maxSlip = Math.max(maxSlip, slipAngleDeg(v, car.getRotation().y));
        }
      }
      return { maxSlip, maxSpeed, inside };
    });
  }
  const grip = await measureTurn(false);
  const hb = await measureTurn(true);
  return {
    pass:
      grip.inside &&
      hb.inside &&
      hb.maxSlip > grip.maxSlip &&
      hb.maxSpeed <= SUV_SPEC.maxSpeed * 1.02,
    detail: `inside=${grip.inside && hb.inside} slip grip=${grip.maxSlip.toFixed(1)} hb=${hb.maxSlip.toFixed(1)} hbMaxSpeed=${hb.maxSpeed.toFixed(3)}`,
  };
}

export function ramCow(a: Arena): Promise<Outcome> {
  return withCar(a, 5.5, 30.5, -90, async (car) => {
    const cow = summonCow(a, 25.5, 30.5);
    if (!cow) return { pass: false, detail: "cow not found" };
    try {
      // A wandering cow can step out of the car's path. Resistance III takes
      // 60% off the ram damage, so the first hit (up to 18) leaves a 10 HP cow
      // alive and its knockback measurable.
      cow.addEffect("slowness", 600, { amplifier: 255, showParticles: false });
      cow.addEffect("resistance", 600, { amplifier: 2, showParticles: false });
      const health = () => cow.getComponent("minecraft:health")?.currentValue;
      const hp0 = health() ?? 0;
      const x0 = a.local(cow.location).x;
      drive(car, 0, 1);
      const samples: RamSample[] = [];
      for (let t = 0; t < 80; t++) {
        await wait(1);
        const valid = cow.isValid;
        samples.push({
          valid,
          hp: valid ? (health() ?? 0) : 0,
          x: valid ? a.local(cow.location).x : Number.NaN,
        });
        const hit = hitTick(hp0, samples);
        // Removing the car on the hit tick leaves the knockback as the only
        // thing moving the cow; a car still driving would shove it along too.
        if (hit >= 0 && car.isValid) car.remove();
        if (!valid || (hit >= 0 && samples.length > hit + PUSH_WINDOW)) break;
      }
      return judgeRam(hp0, x0, samples);
    } finally {
      if (cow.isValid) cow.remove();
    }
  });
}

export function wallDiagonal(a: Arena): Promise<Outcome> {
  // The wall's face spans z 20-41; past its end the sliding car is free
  // again and drives on toward +x (ADR 0081).
  const wallEndZ = 41;
  a.dim.runCommand(`fill ${a.box(45, a.gy, 20, 45, a.gy + 3, 40)} stone`);
  return withCar(a, 20.5, 24.5, -70, async (car) => {
    drive(car, 0, 1);
    let before = 0;
    let maxAfter = 0;
    let endSide = 0;
    let contactTicks = 0;
    let maxX = a.local(car.location).x;
    let hit = false;
    for (let t = 0; t < 120; t++) {
      await wait(1);
      const p = a.local(car.location);
      if (p.z + SUV_SPEC.bodyHalfWidth > wallEndZ) break;
      const v = car.getVelocity();
      maxX = Math.max(maxX, p.x);
      if (!hit && p.x > 43.5) hit = true;
      if (hit) {
        maxAfter = Math.max(maxAfter, Math.abs(v.z));
        endSide = Math.abs(v.z);
        contactTicks++;
      } else before = Math.abs(v.z);
    }
    return {
      pass:
        hit &&
        contactTicks >= 5 &&
        maxX < 45 &&
        // The tick the body first reaches the wall keeps only part of its x
        // velocity, and since frictionMin is 0.2 that sample lowers the
        // estimate slightly more, so the slide runs about 3% faster than
        // under the 0.5 clamp (0.413 against 0.402; ADR 0082).
        maxAfter <= before + 0.12 &&
        endSide >= 0.7 * before,
      detail: `x=${maxX.toFixed(2)} contactTicks=${contactTicks} sideBefore=${before.toFixed(3)} sideAfterMax=${maxAfter.toFixed(3)} sideEnd=${endSide.toFixed(3)}`,
    };
  });
}

// Soul sand slows everything on it on both axes, which the friction estimate
// must learn instead of reading it as a wall (ADR 0082).
export async function suvSoulSand(a: Arena): Promise<Outcome> {
  const floor = a.gy - 1;
  a.dim.runCommand(`fill ${a.box(93, floor, 1, 98, floor, 58)} soul_sand`);
  try {
    return await withCar(a, 95.5, 3.5, 0, async (car) => {
      drive(car, 0, 1);
      let max = 0;
      let reach = -1;
      let under = "none";
      for (let t = 0; t < 200; t++) {
        await wait(1);
        const speed = length(car.getVelocity());
        max = Math.max(max, speed);
        if (reach < 0 && speed >= 0.3) reach = t;
        if (t === 5)
          under =
            a.dim.getBlock({
              x: Math.floor(car.location.x),
              y: Math.floor(car.location.y),
              z: Math.floor(car.location.z),
            })?.typeId ?? "none";
        if (a.local(car.location).z > 54) break;
      }
      return {
        pass: under === "minecraft:soul_sand" && max >= 0.3,
        detail: `max=${max.toFixed(3)} reach0.3=${reach} under=${under} y=${(car.location.y - a.gy).toFixed(3)}`,
      };
    });
  } finally {
    a.dim.runCommand(`fill ${a.box(93, floor, 1, 98, floor, 58)} stone`);
  }
}

export function step2(
  a: Arena,
  z: number,
  yaw: number,
  stepX: number,
): Promise<Outcome> {
  // Place a 2-high step spanning z ± 6, and back-compute the start so that a
  // diagonal approach still meets the step at its z center.
  a.dim.runCommand(
    `fill ${a.box(stepX, a.gy, z - 6, stepX + 8, a.gy + 1, z + 6)} stone`,
  );
  const dir = forward(yaw);
  const startX = stepX - 25 + 0.5;
  const startZ = z - 25 * (dir.z / dir.x) + 0.5;
  return withCar(a, startX, startZ, yaw, async (car) => {
    drive(car, 0, 1);
    let maxY = a.gy;
    for (let t = 0; t < 120; t++) {
      await wait(1);
      maxY = Math.max(maxY, car.location.y);
      if (a.local(car.location).x > stepX + 3) break;
    }
    const end = a.local(car.location);
    const side = Math.abs((end.x - startX) * dir.z - (end.z - startZ) * dir.x);
    const climbed = maxY >= a.gy + 1.9;
    return {
      pass: climbed && side < 0.5,
      detail: `maxY=${(maxY - a.gy).toFixed(2)} sideOffset=${side.toFixed(2)}`,
    };
  });
}

/** The seat a rider sits in, judged the same way as the main pack (ADR 0019). */
function seatOf(vehicle: Entity, rider: Entity): number {
  const offset = {
    x: rider.location.x - vehicle.location.x,
    z: rider.location.z - vehicle.location.z,
  };
  return nearestSeat(
    toLocal(offset, forward(vehicle.getRotation().y)),
    SUV_PROFILE.seats.positions,
  );
}

// Bedrock seats riders by their index in the rider list, so a passenger moves
// up into the driver's seat when the driver gets out (ADR 0019).
export async function seatsAfterDriverLeaves(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`summon ${SEAT_PROBE} ${a.xyz(30.5, a.gy, 8.5)}`);
  const probe = a.dim.getEntities({
    type: SEAT_PROBE,
    location: a.at(30.5, a.gy, 8.5),
    maxDistance: 1.5,
  })[0];
  const cows = [0, 1, 2].map((i) => summonCow(a, 26.5 + i * 2, 4.5));
  try {
    const rideable = probe?.getComponent("minecraft:rideable");
    const [driver, passenger, next] = cows;
    if (!probe || !rideable || !driver || !passenger || !next)
      return { pass: false, detail: "probe or cows missing" };
    probe.setRotation({ x: 0, y: -90 });
    const board = async (cow: Entity) => {
      const ok = rideable.addRider(cow);
      await wait(5);
      return ok;
    };
    const boarded = (await board(driver)) && (await board(passenger));
    const before = [seatOf(probe, driver), seatOf(probe, passenger)];
    rideable.ejectRider(driver);
    await wait(5);
    const afterLeave = seatOf(probe, passenger);
    const nextBoarded = await board(next);
    const afterBoard = [seatOf(probe, passenger), seatOf(probe, next)];
    return {
      pass:
        boarded &&
        nextBoarded &&
        before.join() === "0,1" &&
        afterLeave === 0 &&
        afterBoard.join() === "0,1",
      detail: `boarded=${boarded && nextBoarded} before=${before} afterLeave=${afterLeave} afterBoard=${afterBoard}`,
    };
  } finally {
    for (const cow of cows) if (cow?.isValid) cow.remove();
    if (probe?.isValid) probe.remove();
  }
}

// Players cannot be simulated, so this drives the entity events that a hit
// with a dye triggers and reads back the variant the texture is chosen by.
export function paintEvents(a: Arena): Promise<Outcome> {
  return withCar(a, 5.5, 35.5, 0, async (car) => {
    const variant = () => car.getComponent("minecraft:variant")?.value;
    const seen = [`start=${variant()}`];
    let pass = variant() === PAINT_VARIANT.khaki;
    for (const paint of [...PAINTS.slice(1), PAINTS[0]]) {
      car.triggerEvent(paintEvent(paint));
      await wait(1);
      seen.push(`${paint}=${variant()}`);
      pass &&= variant() === PAINT_VARIANT[paint];
    }
    return { pass, detail: seen.join(" ") };
  });
}

// The switch item needs a player, so this sets the property the switch flips
// and checks the light blocks the main pack keeps in front of the vehicle.
export function headlightsFollowAndClear(a: Arena): Promise<Outcome> {
  return withCar(a, 5.5, 12.5, -90, async (car) => {
    const lightAt = (c: { x: number; y: number; z: number }) =>
      a.dim.getBlock(c)?.typeId === LIGHT_BLOCK;
    const lightsAround = () => {
      let n = 0;
      for (let x = 0; x <= 60; x++)
        for (let z = 9; z <= 16; z++)
          for (let dy = 0; dy <= 2; dy++)
            if (lightAt(a.at(x, a.gy + dy, z))) n++;
      return n;
    };
    car.setProperty(HEADLIGHTS_PROPERTY, true);
    await wait(3);
    const parked = headlightCells(
      car.location,
      car.getRotation().y,
      SUV_PROFILE.beams,
    );
    const litParked = parked.filter(lightAt).length;
    drive(car, 0, 1);
    await wait(30);
    drive(car, 0, 0);
    await wait(20);
    const moved = headlightCells(
      car.location,
      car.getRotation().y,
      SUV_PROFILE.beams,
    );
    const litMoved = moved.filter(lightAt).length;
    const whileOn = lightsAround();
    const level = Math.abs(car.location.y - a.gy) < 0.1;
    car.setProperty(HEADLIGHTS_PROPERTY, false);
    await wait(3);
    const afterOff = lightsAround();
    return {
      pass:
        litParked === parked.length &&
        litMoved === moved.length &&
        whileOn === moved.length &&
        level &&
        afterOff === 0,
      detail: `parked=${litParked}/${parked.length} moved=${litMoved}/${moved.length} whileOn=${whileOn} level=${level} afterOff=${afterOff}`,
    };
  });
}

/** Runs `run` on a car that has taken off over the flight lane. */
function withAirborneCar<T>(
  a: Arena,
  run: (car: Entity) => Promise<T>,
): Promise<T | Outcome> {
  return withCar(a, FLIGHT_PATH.x, FLIGHT_PATH.z, -90, async (car) => {
    await takeOff(car, SUV_SPEC.takeoffTicks);
    const outcome = takeoffOutcome(a, car);
    if (!outcome.pass)
      return { pass: false, detail: `takeoff: ${outcome.detail}` };
    return run(car);
  });
}

function ticksUntilGround(car: Entity, limit: number): Promise<number> {
  return ticksUntilForm(car, "car", limit);
}

export function flightCourse(a: Arena, onStep: StepSink): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    const min = {
      x: Number(FLIGHT_PATH.x),
      y: a.gy,
      z: Number(FLIGHT_PATH.z),
    };
    const max = { ...min };
    const sample = async (ticks: number) => {
      for (let t = 0; t < ticks; t++) {
        await wait(1);
        const p = a.local(car.location);
        for (const axis of ["x", "y", "z"] as const) {
          min[axis] = Math.min(min[axis], p[axis]);
          max[axis] = Math.max(max[axis], p[axis]);
        }
      }
    };
    const withDelta = async (run: () => Promise<Outcome>) => {
      const start = a.local(car.location);
      const heading = car.getRotation().y;
      const outcome = await run();
      const end = a.local(car.location);
      return {
        ...outcome,
        detail: `${outcome.detail} delta=(${(end.x - start.x).toFixed(2)},${(end.y - start.y).toFixed(2)},${(end.z - start.z).toFixed(2)}) heading=${heading.toFixed(1)}->${car.getRotation().y.toFixed(1)}`,
      };
    };
    // At accel 0.0225, 52 cruise ticks travel 29.25 blocks. Coasting from
    // 0.9 at drag 0.02 adds 19.8; a 60-tick cruise would coast past x=60.
    // Banking then flying straight would also leave the 12-block-wide lane.
    const steps: Step[] = [
      {
        name: "cruise",
        run: () =>
          withDelta(async () => {
            drive(car, 0, 1);
            const startY = car.location.y;
            let minY = Number.POSITIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            let speed = 0;
            for (let t = 0; t < 52; t++) {
              await sample(1);
              if (t >= 20) {
                minY = Math.min(minY, car.location.y - startY);
                maxY = Math.max(maxY, car.location.y - startY);
              }
              if (t >= 50) speed = Math.max(speed, length(car.getVelocity()));
            }
            const altRange = maxY - minY;
            // At steady state the speed is maxSpeed * engineDrag / SUV_SPEC.flightDrag,
            // so the ratio reveals the engine's drag with gravity off.
            const measuredDrag =
              (SUV_SPEC.flightDrag * speed) / SUV_SPEC.maxSpeed;
            return {
              pass:
                altRange <= 0.5 &&
                speed >= SUV_SPEC.maxSpeed * 0.95 &&
                speed <= SUV_SPEC.maxSpeed * 1.05,
              detail: `altRange=${altRange.toFixed(3)} speed=${speed.toFixed(3)} measuredDrag=${measuredDrag.toFixed(3)}`,
            };
          }),
      },
      {
        name: "climb_descend",
        run: async () => {
          drive(car, 0, 0);
          // takeOff allows five ticks after its transition; coasting additionally
          // needs maxSpeed / drag ticks before a stationary climb fits the lane.
          await sample(Math.ceil(SUV_SPEC.maxSpeed / SUV_SPEC.drag) + 5);
          if (
            length(car.getVelocity()) > 0.01 ||
            suvProperty(car, "bank") !== 0
          )
            return { pass: false, detail: "did not settle before climb" };
          return withDelta(async () => {
            drive(car, 0, 0, true);
            await sample(20);
            const top = car.location.y;
            drive(car, 0, -1);
            await sample(10);
            // Measured from the lane floor like the former scenario, so the
            // take-off rise counts; the climb is stationary to stay in the lane.
            const climbed = top - a.gy;
            const sank = top - car.location.y;
            return {
              pass: climbed >= 4 && sank >= 1.5,
              detail: `climbed=${climbed.toFixed(2)} sank=${sank.toFixed(2)}`,
            };
          });
        },
      },
    ];
    const outcome = await runCourse(steps, { stopOnFail: true, onStep });
    const inside =
      min.x >= 0 &&
      max.x <= 60 &&
      min.z >= 0 &&
      max.z <= 12 &&
      max.y <= a.gy + 20;
    const bounds = `localBounds x=${min.x.toFixed(2)}..${max.x.toFixed(2)} z=${min.z.toFixed(2)}..${max.z.toFixed(2)} y-gy=${(min.y - a.gy).toFixed(2)}..${(max.y - a.gy).toFixed(2)}`;
    return {
      ...outcome,
      pass: outcome.pass && inside,
      detail: `${outcome.detail}; inside=${inside}; ${bounds}`,
    };
  });
}

export function flightBank(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    const bank = () => Number(suvProperty(car, "bank"));
    // Turn right: the lane runs along the arena's low-z edge, and a car that
    // leaves the ticking area stops updating.
    drive(car, -1, 1);
    await wait(20);
    const turning = bank();
    drive(car, 0, 1);
    await wait(20);
    const straight = bank();
    return {
      // Steering right lowers the right side, so the angle is positive (ADR 0026).
      pass: turning >= SUV_SPEC.maxBank / 2 && straight === 0,
      detail: `turning=${turning.toFixed(1)} straight=${straight.toFixed(1)}`,
    };
  });
}

export function flightLand(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, (car) =>
    gearDownLandingOutcome(a, car, SUV_SPEC.gearDownHeight),
  );
}

export function flightTouchdown(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    drive(car, 0, -1);
    const landedAt = await ticksUntilGround(car, 40);
    // Release the stick, or it reverses the car once it is on the ground.
    drive(car, 0, 0);
    await wait(20);
    const restY = car.location.y - a.gy;
    const gearDown = suvProperty(car, "gear_down") === true;
    return {
      pass: landedAt >= 0 && Math.abs(restY) <= 0.1 && gearDown,
      detail: `landedAt=${landedAt} restY=${restY.toFixed(2)} gearDown=${gearDown}`,
    };
  });
}

export function flightDriverless(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    clearInput(car);
    await wait(3);
    const afterClear = vehicleForm(car);
    const landedAt = await ticksUntilGround(car, 60);
    return {
      pass: afterClear === "landing" && landedAt >= 0,
      detail: `afterClear=${afterClear} landedAt=${landedAt}`,
    };
  });
}

// Deep enough for a full car height of water. In the flat dev world
// (gy = -60) a 3-deep pool puts its stone floor at -64, the bottom of the
// world, so the scaled SUV (carHeight 2.08, ADR 0170) gets no spare block of
// water under it; a carHeight above 3 no longer fits and withPool throws
// instead of filling below the world.
const DIVE_DEPTH = Math.ceil(SUV_SPEC.carHeight);

// The car holds depth exactly once it is a submarine (the dive check measured
// a range of 0.000), so 0.1 only absorbs float noise in the reported position.
// The same margin keeps the held depth clear of the bed and the float line, so
// a car that sank onto the bed or rose to the surface fails the hold check.
const DEPTH_HOLD_TOLERANCE = 0.1;

function withinFivePercent(value: number, target: number): boolean {
  return value >= target * 0.95 && value <= target * 1.05;
}

/** Runs `run` on a car heading +x along the pool, starting on dry ground. */
function withPoolCar<T>(
  a: Arena,
  run: (car: Entity) => Promise<T>,
): Promise<T> {
  return withCar(a, 5.5, POOL.z, -90, run);
}

/** Runs `run` on a car that has driven into the pool and become a submarine. */
function withDivingCar<T>(
  a: Arena,
  run: (car: Entity, enteredAt: number) => Promise<T>,
): Promise<T> {
  return withPoolCar(a, async (car) => {
    drive(car, 0, 1);
    const enteredAt = await ticksUntilForm(car, "submarine", 100);
    drive(car, 0, 0);
    await wait(5);
    return run(car, enteredAt);
  });
}

export function submarineCourse(a: Arena, onStep: StepSink): Promise<Outcome> {
  return withPool(a, DIVE_DEPTH, () =>
    withDivingCar(a, async (car, enteredAt) => {
      const steps: Step[] = [
        {
          name: "dive",
          run: async () => {
            const y0 = car.location.y;
            drive(car, 0, 1);
            let minY = y0;
            let maxY = y0;
            let speed = 0;
            let submerged = enteredAt >= 0;
            for (let t = 0; t < 60; t++) {
              await wait(1);
              submerged &&= vehicleForm(car) === "submarine";
              minY = Math.min(minY, car.location.y);
              maxY = Math.max(maxY, car.location.y);
              if (t >= 50) speed = Math.max(speed, length(car.getVelocity()));
            }
            const drift = Math.max(y0 - minY, maxY - y0);
            const bed = a.gy - DIVE_DEPTH;
            const floatLine = a.gy - SUV_SPEC.floatDraft;
            const heldDepth =
              drift <= DEPTH_HOLD_TOLERANCE &&
              minY > bed + DEPTH_HOLD_TOLERANCE &&
              maxY < floatLine - DEPTH_HOLD_TOLERANCE;
            // Sink to the bed, then rise with Jump held. The flat world's floor is
            // near the bottom of the world, so the pool is only a few blocks deep
            // and the rise is sampled in its first ticks, while still submerged.
            // The first ticks overshoot (the input lands a tick late and the
            // impulse assumes SUV_SPEC.waterVerticalDrag), so only the last two
            // samples count.
            drive(car, 0, -1);
            await wait(20);
            drive(car, 0, 0, true);
            const rise: number[] = [];
            for (let t = 0; t < 5; t++) {
              await wait(1);
              if (vehicleForm(car) !== "submarine") break;
              rise.push(car.getVelocity().y);
            }
            const steady = rise.slice(3);
            const riseSpeed =
              steady.length === 2
                ? steady.reduce((sum, v) => sum + v, 0) / steady.length
                : Number.NaN;
            // As in the flight cruise step, steady speed is target * engineDrag /
            // the SUV_SPEC drag: SUV_SPEC.waterDrag horizontally,
            // SUV_SPEC.waterVerticalDrag vertically. The ratio reveals the
            // engine's drag in water.
            const measuredDrag =
              (SUV_SPEC.waterDrag * speed) / SUV_SPEC.maxWaterSpeed;
            const measuredVerticalDrag =
              (SUV_SPEC.waterVerticalDrag * riseSpeed) / SUV_SPEC.maxClimb;
            drive(car, 0, 0);
            await wait(5);
            submerged &&=
              vehicleForm(car) === "submarine" && car.location.y < a.gy;
            return {
              pass:
                submerged &&
                heldDepth &&
                withinFivePercent(speed, SUV_SPEC.maxWaterSpeed) &&
                withinFivePercent(riseSpeed, SUV_SPEC.maxClimb),
              detail: `enteredAt=${enteredAt} submerged=${submerged} y0=${(y0 - a.gy).toFixed(3)} drift=${drift.toFixed(3)} speed=${speed.toFixed(3)} riseSpeed=${riseSpeed.toFixed(3)} measuredDrag=${measuredDrag.toFixed(3)} measuredVerticalDrag=${measuredVerticalDrag.toFixed(3)}`,
            };
          },
        },
        {
          name: "bank",
          run: async () => {
            const start = a.local(car.location);
            const heading = car.getRotation().y;
            const bank = () => Number(suvProperty(car, "bank"));
            // Turn right into the open water, as flight_bank does in the air (ADR 0044).
            drive(car, -1, 1);
            await wait(20);
            const turning = bank();
            drive(car, 0, 0);
            await wait(20);
            const straight = bank();
            const end = a.local(car.location);
            return {
              pass:
                enteredAt >= 0 &&
                vehicleForm(car) === "submarine" &&
                turning >= SUV_SPEC.maxBank / 2 &&
                straight === 0,
              detail: `enteredAt=${enteredAt} turning=${turning.toFixed(1)} straight=${straight.toFixed(1)} dx=${(end.x - start.x).toFixed(2)} dz=${(end.z - start.z).toFixed(2)} dy=${(end.y - start.y).toFixed(2)} heading=${heading.toFixed(1)}->${car.getRotation().y.toFixed(1)}`,
            };
          },
        },
        {
          name: "breach",
          run: async () => {
            drive(car, 0, 0, true);
            let hoverAt = -1;
            let noCar = vehicleForm(car) === "submarine";
            let dry = false;
            for (let t = 0; t < 60; t++) {
              await wait(1);
              const form = vehicleForm(car);
              noCar &&= form !== "car";
              if (form === "hover") {
                hoverAt = t;
                dry = car.location.y >= a.gy;
                break;
              }
            }
            return {
              pass: enteredAt >= 0 && hoverAt >= 0 && noCar && dry,
              detail: `enteredAt=${enteredAt} hoverAt=${hoverAt} noCar=${noCar} dry=${dry} rise=${(car.location.y - a.gy).toFixed(2)}`,
            };
          },
        },
      ];
      return runCourse(steps, { stopOnFail: true, onStep });
    }),
  );
}

export function submarineShore(a: Arena): Promise<Outcome> {
  const depth = DIVE_DEPTH;
  const shoreX = 40;
  // Wide enough that the car, coasting after it becomes a car with the
  // throttle off, settles on the last submerged step instead of reaching the
  // dry one. It becomes a car near the submarine's top speed (0.5) and loses
  // only SUV_SPEC.drag (0.02) per tick: with tread 8 it became a car 1.9 blocks
  // past the riser and coasted 7.75 blocks up onto the dry step; with tread
  // 14 it coasted 7.96 blocks and its front stopped 2.5 blocks short of the
  // next riser.
  const tread = 14;
  const dryX = shoreX + (depth - 1) * tread;
  return withPool(a, depth, () => {
    // One-block steps up from the bed; the top one is level with the floor.
    for (let step = 1; step <= depth; step++) {
      a.dim.runCommand(
        `fill ${a.box(shoreX + (step - 1) * tread, a.gy - depth, POOL.minZ, POOL.maxX, a.gy - depth + step - 1, POOL.maxZ)} stone`,
      );
    }
    return withDivingCar(a, async (car, enteredAt) => {
      drive(car, 0, 1);
      const landedAt = await ticksUntilGround(car, 200);
      const landedX = a.local(car.location).x;
      const landedY = car.location.y - a.gy;
      // It becomes a car while the step climb lifts it over the last
      // submerged step, once its roof clears the surface, and can still be in
      // the air (landedY=0.66 in the first run). With the throttle off it
      // drops onto that step, in water shallower than its roof, and must stay
      // a car there without flipping back to a submarine.
      drive(car, 0, 0);
      const forms = new Set<Form | undefined>();
      for (let t = 0; t < 40; t++) {
        await wait(1);
        forms.add(vehicleForm(car));
      }
      const parkedX = a.local(car.location).x;
      const parkedY = car.location.y - a.gy;
      // The submerged step's top is a block below the dry floor (gy - 1), so
      // half a block separates parking in water from parking on dry land.
      const parkedInWater = parkedX < dryX && parkedY < -0.5;
      drive(car, 0, 1);
      let climbedOut = false;
      for (let t = 0; t < 100 && !climbedOut; t++) {
        await wait(1);
        climbedOut =
          a.local(car.location).x >= dryX + 1 &&
          Math.abs(car.location.y - a.gy) <= 0.1 &&
          vehicleForm(car) === "car";
      }
      return {
        pass:
          enteredAt >= 0 &&
          landedAt >= 0 &&
          landedX >= shoreX &&
          landedX < dryX &&
          parkedInWater &&
          forms.size === 1 &&
          forms.has("car") &&
          climbedOut,
        detail: `enteredAt=${enteredAt} landedAt=${landedAt} landedX=${landedX.toFixed(2)} landedY=${landedY.toFixed(2)} parkedX=${parkedX.toFixed(2)} parkedY=${parkedY.toFixed(2)} parkedForms=${[...forms].join("/")} climbedOut=${climbedOut} x=${a.local(car.location).x.toFixed(2)} y=${(car.location.y - a.gy).toFixed(2)} form=${vehicleForm(car)}`,
      };
    });
  });
}

export function submarineUnmanned(a: Arena): Promise<Outcome> {
  return withPool(a, DIVE_DEPTH, () =>
    withDivingCar(a, async (car, enteredAt) => {
      const startY = car.location.y;
      clearInput(car);
      let submarineOnly = vehicleForm(car) === "submarine";
      for (let t = 0; t < 120; t++) {
        await wait(1);
        submarineOnly &&= vehicleForm(car) === "submarine";
      }
      let minY = car.location.y;
      let maxY = minY;
      let maxFloatError = 0;
      for (let t = 0; t < 40; t++) {
        await wait(1);
        submarineOnly &&= vehicleForm(car) === "submarine";
        minY = Math.min(minY, car.location.y);
        maxY = Math.max(maxY, car.location.y);
        maxFloatError = Math.max(
          maxFloatError,
          Math.abs(a.gy - car.location.y - SUV_SPEC.floatDraft),
        );
      }
      const rise = car.location.y - startY;
      return {
        pass:
          enteredAt >= 0 &&
          submarineOnly &&
          rise >= 0.2 &&
          maxFloatError <= 0.1 &&
          maxY - minY <= 0.1,
        detail: `enteredAt=${enteredAt} submarineOnly=${submarineOnly} rise=${rise.toFixed(3)} maxFloatError=${maxFloatError.toFixed(3)} floatRange=${(maxY - minY).toFixed(3)}`,
      };
    }),
  );
}

export function submarineShallow(a: Arena): Promise<Outcome> {
  return withPool(a, 1, () =>
    withPoolCar(a, async (car) => {
      drive(car, 0, 1);
      let carOnly = true;
      let crossed = false;
      let enteredWater = false;
      for (let t = 0; t < 240; t++) {
        await wait(1);
        const p = a.local(car.location);
        carOnly &&= vehicleForm(car) === "car";
        enteredWater ||= p.x > POOL.minX + 2 && car.location.y < a.gy - 0.5;
        if (p.x > POOL.maxX + 3) {
          crossed = true;
          break;
        }
      }
      return {
        pass: carOnly && enteredWater && crossed,
        detail: `carOnly=${carOnly} enteredWater=${enteredWater} crossed=${crossed} x=${a.local(car.location).x.toFixed(2)}`,
      };
    }),
  );
}

// Summoned cars have no owner, so they share the unowned group (ADR 0066).
// One more than its limit removes the first car summoned.
export async function vehicleLimit(a: Arena): Promise<Outcome> {
  const cars: Entity[] = [];
  try {
    for (let i = 0; i <= SPEC.maxUnownedVehicles; i++) {
      cars.push(
        spawnCar(a, 60.5 + (i % 6) * 6, 30.5 + Math.floor(i / 6) * 6, 0),
      );
    }
    // Checked before the wait, so a car lost for another reason fails the test.
    const summoned = cars.filter((c) => c.isValid).length;
    await wait(20);
    const [oldest, ...rest] = cars;
    const restValid = rest.filter((c) => c.isValid).length;
    return {
      pass:
        summoned === cars.length &&
        !oldest?.isValid &&
        restValid === SPEC.maxUnownedVehicles,
      detail: `summoned=${summoned} oldestRemoved=${!oldest?.isValid} restValid=${restValid}`,
    };
  } finally {
    for (const car of cars) if (car.isValid) car.remove();
  }
}
