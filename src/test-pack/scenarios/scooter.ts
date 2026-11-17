import type { Entity } from "@minecraft/server";
import { forward, length } from "../../domain/shared/vec";
import type { SCOOTER_ENTITY } from "../../domain/vehicle/kinds/scooter/entity";
import { SCOOTER_PROFILE } from "../../domain/vehicle/kinds/scooter/profile";
import { SCOOTER_SPEC } from "../../domain/vehicle/kinds/scooter/spec";
import { headlightCells } from "../../domain/vehicle/lighting/headlights";
import { nearestSeat, toLocal } from "../../domain/vehicle/seats";
import { LIGHT_BLOCK } from "../../infrastructure/shared/lightBlocks";
import {
  ENTITY_TYPE,
  entityPropertyId,
  HEADLIGHTS_PROPERTY,
} from "../../infrastructure/vehicle/bedrock/identifiers";
import {
  type Arena,
  clearInput,
  drive,
  insideArena,
  POOL,
  SCOOTER_SEAT_PROBE,
  wait,
  withCar,
  withPool,
} from "../arena";
import type { Outcome } from "../outcome";
import { hitTick, judgeRam, PUSH_WINDOW, type RamSample } from "../ramJudge";
import {
  FLIGHT_PATH,
  gearDownLandingOutcome,
  summonCow,
  takeOff,
  takeoffOutcome,
  ticksToReach,
  vehicleForm,
} from "./shared";

function scooterProperty(
  car: Entity,
  name: keyof typeof SCOOTER_ENTITY.properties,
): ReturnType<Entity["getProperty"]> {
  return car.getProperty(entityPropertyId(name));
}

function withScooter<T>(
  a: Arena,
  x: number,
  z: number,
  run: (car: Entity) => Promise<T>,
): Promise<T> {
  return withCar(a, x, z, -90, run, ENTITY_TYPE.scooter);
}

const POOL_DEPTH = Math.ceil(SCOOTER_SPEC.carHeight);
const FLOAT_TOLERANCE = 0.1;
const SETTLE_TICKS = 80;

function atFloatLine(a: Arena, car: Entity): boolean {
  return (
    Math.abs(a.gy - car.location.y - SCOOTER_SPEC.floatDraft) <= FLOAT_TOLERANCE
  );
}

function withinFivePercent(value: number, target: number): boolean {
  return value >= target * 0.95 && value <= target * 1.05;
}

export function scooterAccel(a: Arena): Promise<Outcome> {
  return withScooter(a, 5.5, 20.5, async (car) => {
    drive(car, 0, 1);
    const reach = await ticksToReach(
      car,
      0.95,
      SCOOTER_SPEC.maxSpeed,
      60,
      () => false,
    );
    const speed = length(car.getVelocity());
    // Match accel_and_step1: reach is zero-based and includes pack-order slack.
    return {
      pass:
        reach >= 0 &&
        reach <= 46 &&
        withinFivePercent(speed, SCOOTER_SPEC.maxSpeed),
      detail: `reach95=${reach} speed=${speed.toFixed(3)}`,
    };
  });
}

export function scooterWaterSurface(a: Arena): Promise<Outcome> {
  return withPool(a, POOL_DEPTH, () =>
    withScooter(a, 5.5, POOL.z, async (car) => {
      drive(car, 0, 1);
      let carOnly = true;
      let entered = false;
      let surface = true;
      const speeds: number[] = [];
      for (let tick = 0; tick < 90; tick++) {
        await wait(1);
        carOnly &&= vehicleForm(car) === "car";
        const x = a.local(car.location).x;
        if (x > POOL.minX + SCOOTER_SPEC.bodyFront) {
          entered = true;
          // Surface support recovers gradually from the shore-entry fall.
          if (tick >= 60) {
            surface &&= atFloatLine(a, car);
            speeds.push(length(car.getVelocity()));
          }
        }
      }
      return {
        pass:
          carOnly &&
          entered &&
          surface &&
          speeds.length > 0 &&
          speeds.every((speed) =>
            withinFivePercent(speed, SCOOTER_SPEC.maxWaterSpeed),
          ) &&
          atFloatLine(a, car),
        detail: `carOnly=${carOnly} entered=${entered} surface=${surface} speeds=${speeds.map((s) => s.toFixed(3)).join(",")} y=${(car.location.y - a.gy).toFixed(3)}`,
      };
    }),
  );
}

export function scooterWaterFloat(a: Arena): Promise<Outcome> {
  return withPool(a, POOL_DEPTH, () =>
    withScooter(a, POOL.minX + 5.5, POOL.z, async (car) => {
      await wait(SETTLE_TICKS);
      const start = car.location;
      let still = true;
      let level = true;
      let surface = true;
      let standUp = true;
      let carOnly = true;
      for (let tick = 0; tick < 40; tick++) {
        await wait(1);
        still &&= length(car.getVelocity()) < SCOOTER_SPEC.standSpeed;
        level &&=
          scooterProperty(car, "lean") === 0 &&
          scooterProperty(car, "bank") === 0;
        surface &&= atFloatLine(a, car);
        standUp &&= scooterProperty(car, "stand") === false;
        carOnly &&= vehicleForm(car) === "car";
      }
      const drift = Math.hypot(
        car.location.x - start.x,
        car.location.z - start.z,
      );
      car.teleport({ ...car.location, y: a.gy - SCOOTER_SPEC.carHeight });
      car.clearVelocity();
      const submergedY = car.location.y;
      for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await wait(1);
        standUp &&= scooterProperty(car, "stand") === false;
        carOnly &&= vehicleForm(car) === "car";
      }
      const rise = car.location.y - submergedY;
      return {
        pass:
          still &&
          level &&
          surface &&
          standUp &&
          carOnly &&
          drift <= FLOAT_TOLERANCE &&
          rise > SCOOTER_SPEC.floatDraft &&
          atFloatLine(a, car),
        detail: `still=${still} level=${level} surface=${surface} standUp=${standUp} carOnly=${carOnly} drift=${drift.toFixed(3)} rise=${rise.toFixed(3)} y=${(car.location.y - a.gy).toFixed(3)}`,
      };
    }),
  );
}

async function takeoffAndLand(
  a: Arena,
  car: Entity,
  water: boolean,
): Promise<Outcome> {
  if (water) {
    await wait(SETTLE_TICKS);
    if (!atFloatLine(a, car))
      return { pass: false, detail: "not floating before takeoff" };
  }
  const startY = car.location.y;
  await takeOff(car, SCOOTER_SPEC.takeoffTicks);
  const takeoff = takeoffOutcome({ ...a, gy: startY }, car);
  const folded = scooterProperty(car, "gear_down") === false;
  if (!takeoff.pass || !folded)
    return { pass: false, detail: `${takeoff.detail} folded=${folded}` };
  // The landing helper checks solid ground and restored gravity, so move off the pool.
  if (water) car.teleport(a.at(FLIGHT_PATH.x, car.location.y, FLIGHT_PATH.z));
  const landing = await gearDownLandingOutcome(
    a,
    car,
    SCOOTER_SPEC.gearDownHeight,
  );
  return {
    pass: landing.pass,
    detail: `takeoff: ${takeoff.detail} folded=${folded}; landing: ${landing.detail}`,
  };
}

export function scooterTakeoffGround(a: Arena): Promise<Outcome> {
  return withScooter(a, FLIGHT_PATH.x, FLIGHT_PATH.z, (car) =>
    takeoffAndLand(a, car, false),
  );
}

export function scooterTakeoffWater(a: Arena): Promise<Outcome> {
  return withPool(a, POOL_DEPTH, () =>
    withScooter(a, POOL.minX + 5.5, FLIGHT_PATH.z, (car) =>
      takeoffAndLand(a, car, true),
    ),
  );
}

export async function scooterStand(a: Arena): Promise<Outcome> {
  const ground = await withScooter(a, 5.5, 20.5, async (car) => {
    await wait(5);
    const empty = scooterProperty(car, "stand") === true;
    drive(car, 0, 0);
    await wait(5);
    const boarded = scooterProperty(car, "stand") === false;
    clearInput(car);
    await wait(5);
    const emptyAgain = scooterProperty(car, "stand") === true;
    return {
      pass: empty && boarded && emptyAgain,
      detail: `empty=${empty} boarded=${boarded} emptyAgain=${emptyAgain}`,
    };
  });
  const water = await withPool(a, POOL_DEPTH, () =>
    withScooter(a, POOL.minX + 5.5, POOL.z, async (car) => {
      await wait(SETTLE_TICKS);
      let up = true;
      for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await wait(1);
        up &&= scooterProperty(car, "stand") === false;
      }
      drive(car, 0, 0);
      await wait(5);
      return (
        up && scooterProperty(car, "stand") === false && atFloatLine(a, car)
      );
    }),
  );
  return {
    pass: ground.pass && water,
    detail: `${ground.detail} water=${water}`,
  };
}

export function scooterLeanSteer(a: Arena): Promise<Outcome> {
  return withScooter(a, 5.5, 50.5, async (car) => {
    drive(car, 0, 1);
    await wait(45);
    let bounded = true;
    let inside = true;
    const sample = async (ticks: number) => {
      for (let tick = 0; tick < ticks; tick++) {
        await wait(1);
        bounded &&=
          Math.abs(Number(scooterProperty(car, "lean"))) <=
            SCOOTER_SPEC.maxLean &&
          Math.abs(Number(scooterProperty(car, "steer"))) <=
            SCOOTER_SPEC.maxSteer;
        inside &&= insideArena(
          a.local(car.location),
          SCOOTER_SPEC.bodyHalfWidth,
        );
      }
      return {
        lean: Number(scooterProperty(car, "lean")),
        steer: Number(scooterProperty(car, "steer")),
      };
    };
    drive(car, 1, 1);
    const left = await sample(20);
    drive(car, -1, 1);
    const right = await sample(30);
    drive(car, 0, 0);
    const released = await sample(
      Math.ceil(SCOOTER_SPEC.maxLean / SCOOTER_SPEC.leanRate) + 2,
    );
    return {
      pass:
        bounded &&
        inside &&
        left.lean > 0 &&
        left.steer > 0 &&
        right.lean < 0 &&
        right.steer < 0 &&
        released.lean === 0 &&
        released.steer === 0,
      detail: `bounded=${bounded} inside=${inside} left=${JSON.stringify(left)} right=${JSON.stringify(right)} released=${JSON.stringify(released)}`,
    };
  });
}

// Rider safety needs a manual check: production riders are players, which this harness cannot simulate.
export function scooterRamCow(a: Arena): Promise<Outcome> {
  return withScooter(a, 5.5, 30.5, async (car) => {
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

// The body switch needs a player; script can check its shared lamp property
// and light blocks, but not the client-rendered headlight and tail lamps.
export function scooterHeadlights(a: Arena): Promise<Outcome> {
  return withScooter(a, 5.5, 12.5, async (car) => {
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
      SCOOTER_PROFILE.beams,
    );
    const switchedOn = car.getProperty(HEADLIGHTS_PROPERTY) === true;
    const litParked = parked.filter(lightAt).length;
    const parkedX = car.location.x;
    drive(car, 0, 1);
    await wait(30);
    drive(car, 0, 0);
    await wait(20);
    const moved = headlightCells(
      car.location,
      car.getRotation().y,
      SCOOTER_PROFILE.beams,
    );
    const litMoved = moved.filter(lightAt).length;
    const distance = car.location.x - parkedX;
    const whileOn = lightsAround();
    const level = Math.abs(car.location.y - a.gy) < 0.1;
    car.setProperty(HEADLIGHTS_PROPERTY, false);
    await wait(3);
    const afterOff = lightsAround();
    return {
      pass:
        distance > SCOOTER_SPEC.bodyFront &&
        switchedOn &&
        car.getProperty(HEADLIGHTS_PROPERTY) === false &&
        litParked === parked.length &&
        litMoved === moved.length &&
        whileOn === moved.length &&
        level &&
        afterOff === 0,
      detail: `distance=${distance.toFixed(3)} switchedOn=${switchedOn} parked=${litParked}/${parked.length} moved=${litMoved}/${moved.length} whileOn=${whileOn} level=${level} afterOff=${afterOff}`,
    };
  });
}

// Production scooters accept only players; the probe preserves their seat layout for cows.
export async function scooterSeats(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`summon ${SCOOTER_SEAT_PROBE} ${a.xyz(30.5, a.gy, 8.5)}`);
  const probe = a.dim.getEntities({
    type: SCOOTER_SEAT_PROBE,
    location: a.at(30.5, a.gy, 8.5),
    maxDistance: 1.5,
  })[0];
  const cows = [0, 1].map((i) => summonCow(a, 26.5 + i * 2, 4.5));
  try {
    const rideable = probe?.getComponent("minecraft:rideable");
    const [first, second] = cows;
    if (!probe || !rideable || !first || !second)
      return { pass: false, detail: "probe or cows missing" };
    probe.setRotation({ x: 0, y: -90 });
    const seatOf = (rider: Entity) =>
      nearestSeat(
        toLocal(
          {
            x: rider.location.x - probe.location.x,
            z: rider.location.z - probe.location.z,
          },
          forward(probe.getRotation().y),
        ),
        SCOOTER_PROFILE.seats.positions,
      );
    let pass = true;
    const orders: string[] = [];
    for (const [driver, passenger] of [
      [first, second],
      [second, first],
    ] as const) {
      const driverBoarded = rideable.addRider(driver);
      await wait(5);
      const passengerBoarded = rideable.addRider(passenger);
      await wait(5);
      const seats = [seatOf(driver), seatOf(passenger)];
      const riders = rideable.getRiders();
      pass &&=
        driverBoarded &&
        passengerBoarded &&
        riders.length === 2 &&
        riders.some((r) => r.id === driver.id) &&
        riders.some((r) => r.id === passenger.id) &&
        seats.join() === "0,1";
      orders.push(
        `${driver.id}: boarded=${driverBoarded}/${passengerBoarded} seats=${seats} riders=${riders.length}`,
      );
      rideable.ejectRiders();
      await wait(5);
    }
    return { pass, detail: orders.join("; ") };
  } finally {
    for (const cow of cows) if (cow?.isValid) cow.remove();
    if (probe?.isValid) probe.remove();
  }
}
