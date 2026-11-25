import { type Entity, system } from "@minecraft/server";
import { length } from "../../domain/shared/vec";
import { MOTION } from "../../domain/vehicle/motion/constants";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import {
  TEST_BOOST_CREW_EVENT,
  TEST_BOOST_CREW_RESULT,
} from "../../infrastructure/vehicle/testHooks/testBoostCrew";
import { type Arena, drive, wait, waitUntil, withCar } from "../arena";
import type { Outcome, StepSink } from "../outcome";
import { vehicleForm } from "./shared";
import {
  boostSpecs,
  type FlyingKind,
  reachBoostCruise,
  withBoostRunway,
} from "./support/boosterRunway";
import { withBoostRider } from "./support/boostRiderProbe";

async function landing(
  a: Arena,
  kind: FlyingKind,
  onStep?: StepSink,
): Promise<Outcome> {
  const spec = boostSpecs[kind];
  const peak = spec.maxSpeed * MOTION.boostFlightScale;
  const bleedTicks = Math.ceil(
    (MOTION.boostFlightScale - 1) / MOTION.boostBleed,
  );
  return withBoostRunway(a, () =>
    withCar(
      a,
      32.5,
      5.5,
      0,
      async (car) => {
        await wait(3);
        return withBoostRider(a, car, async (rider: Entity) => {
          const rideable = car.getComponent("minecraft:rideable");
          const health = rider.getComponent("minecraft:health")?.currentValue;
          await reachBoostCruise(car, kind, onStep);
          const cruise = length(car.getVelocity());
          for (const pressed of [true, false, true, false]) {
            drive(car, 0, 1, pressed);
            await wait(2);
          }
          const descending = vehicleForm(car) === "landing";
          let safe = health !== undefined && health > 0;
          let touchdown = -1;
          const speeds: number[] = [];
          const positions: number[] = [];
          for (let t = 0; t < bleedTicks + 40; t++) {
            safe &&=
              rider.isValid &&
              rideable?.getRiders().some((r) => r.id === rider.id) === true &&
              rider.getComponent("minecraft:health")?.currentValue === health;
            speeds.push(length(car.getVelocity()));
            positions.push(car.location.z);
            if (vehicleForm(car) === "car" && touchdown < 0) touchdown = t;
            if (touchdown >= 0 && t >= touchdown + bleedTicks + 4) break;
            await wait(1);
          }
          const deltas = positions
            .slice(1)
            .map((z, i) => z - (positions[i] ?? z));
          const landingSpeed = speeds[touchdown - 1] ?? 0;
          const settled = speeds.findIndex(
            (speed, tick) => tick >= touchdown && speed <= spec.maxSpeed * 1.05,
          );
          const beforeSettling = speeds.slice(
            Math.max(0, touchdown - 2),
            settled + 1,
          );
          const maxDrop = Math.max(
            ...beforeSettling
              .slice(1)
              .map((v, i) => (beforeSettling[i] ?? v) - v),
          );
          const pass =
            descending &&
            Math.abs(cruise - peak) <= peak * 0.05 &&
            touchdown > 0 &&
            safe &&
            landingSpeed >= peak * 0.94 &&
            Math.abs(settled - touchdown - bleedTicks) <= 3 &&
            maxDrop <= spec.maxSpeed * MOTION.boostBleed * 1.5 &&
            Math.abs((speeds.at(-1) ?? 0) - spec.maxSpeed) <=
              spec.maxSpeed * 0.05;
          return {
            pass,
            detail: [
              `cruise=${cruise.toFixed(3)}`,
              `touchdown=${touchdown}`,
              `settled=${settled}`,
              `maxDrop=${maxDrop.toFixed(3)}`,
              `riderHealth=${health}`,
              `safe=${safe}`,
              `displacement[touchdown-2..+3]=${deltas
                .slice(Math.max(0, touchdown - 3), touchdown + 3)
                .map((v) => v.toFixed(3))
                .join(",")}`,
              `speeds=${speeds.map((v) => v.toFixed(2)).join(",")}`,
            ].join(" "),
          };
        });
      },
      ENTITY_TYPE[kind],
    ),
  );
}

async function crew(a: Arena, kind: FlyingKind): Promise<Outcome> {
  await wait(3);
  return withCar(
    a,
    45.5,
    40.5,
    0,
    async (car) => {
      await wait(4);
      let result: string | undefined;
      const listener = system.afterEvents.scriptEventReceive.subscribe((ev) => {
        if (
          ev.id === TEST_BOOST_CREW_RESULT &&
          ev.message.split(",")[0] === car.id
        )
          result = ev.message;
      });
      try {
        system.sendScriptEvent(TEST_BOOST_CREW_EVENT, car.id);
        await waitUntil(32, () => result !== undefined);
        const expected = [
          car.id,
          true,
          true,
          false,
          kind === "bulldozer" ? "single" : "off",
        ].join(",");
        return {
          pass: result === expected,
          detail: `id,boosted,empty,boostAfterExit,handover=${result}`,
        };
      } finally {
        system.afterEvents.scriptEventReceive.unsubscribe(listener);
      }
    },
    ENTITY_TYPE[kind],
  );
}

export const suvBoostLanding = (a: Arena) => landing(a, "suv");
export const camperBoostLanding = (a: Arena, onStep?: StepSink) =>
  landing(a, "camper", onStep);
export const scooterBoostLanding = (a: Arena) => landing(a, "scooter");
export const bulldozerBoostLanding = (a: Arena) => landing(a, "bulldozer");
export const suvBoostCrew = (a: Arena) => crew(a, "suv");
export const camperBoostCrew = (a: Arena) => crew(a, "camper");
export const scooterBoostCrew = (a: Arena) => crew(a, "scooter");
export const bulldozerBoostCrew = (a: Arena) => crew(a, "bulldozer");
