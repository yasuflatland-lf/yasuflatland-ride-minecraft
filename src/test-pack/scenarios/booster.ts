import { system } from "@minecraft/server";
import { length } from "../../domain/shared/vec";
import { MOTION } from "../../domain/vehicle/motion/constants";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { TEST_BOOST_EVENT } from "../../infrastructure/vehicle/testHooks/identifiers";
import { type Arena, drive, wait, withCar } from "../arena";
import type { Outcome, StepSink } from "../outcome";
import { vehicleForm } from "./shared";
import {
  boostSpecs,
  reachBoostCruise,
  withBoostRunway,
} from "./support/boosterRunway";

function boostRelease(
  a: Arena,
  kind: keyof typeof boostSpecs,
  onStep?: StepSink,
): Promise<Outcome> {
  const spec = boostSpecs[kind];
  const peak = spec.maxSpeed * MOTION.boostFlightScale;
  const duration = Math.ceil((MOTION.boostFlightScale - 1) / MOTION.boostBleed);
  return withBoostRunway(a, () =>
    withCar(
      a,
      32.5,
      5.5,
      0,
      async (car) => {
        await reachBoostCruise(car, kind, onStep);
        drive(car, 0, 1, true);
        const start = car.location;
        const crossTicks = Math.ceil(48 / peak);
        await wait(crossTicks);
        const crossed = car.location.z - start.z;
        const before = car.getVelocity();
        system.sendScriptEvent(TEST_BOOST_EVENT, `${car.id},off`);
        const speeds = [length(before)];
        const climbs = [before.y];
        for (let t = 0; t < duration + 4; t++) {
          await wait(1);
          const velocity = car.getVelocity();
          speeds.push(length(velocity));
          climbs.push(velocity.y);
        }
        const near = (value: number, target: number) =>
          Math.abs(value - target) <= target * 0.05;
        const settled = speeds.findIndex((speed) => near(speed, spec.maxSpeed));
        // The event is delivered on the following tick. Align both axes to the first deceleration sample.
        const firstDrop = speeds.findIndex((speed) => speed < peak * 0.98);
        const followsCap = (samples: number[], normal: number) =>
          samples.every((value, i) => {
            const elapsed = Math.max(0, i - firstDrop + 1);
            return near(
              value,
              normal *
                Math.max(
                  1,
                  MOTION.boostFlightScale - elapsed * MOTION.boostBleed,
                ),
            );
          });
        const format = (samples: number[]) =>
          samples.map((v) => v.toFixed(3)).join(",");
        return {
          pass:
            vehicleForm(car) === "hover" &&
            near(crossed, crossTicks * peak) &&
            near(length(before), peak) &&
            near(before.y, spec.maxClimb * MOTION.boostFlightScale) &&
            Math.abs(settled - duration) <= 2 &&
            near(speeds[speeds.length - 1] ?? 0, spec.maxSpeed) &&
            firstDrop >= 1 &&
            firstDrop <= 3 &&
            followsCap(speeds, spec.maxSpeed) &&
            followsCap(climbs, spec.maxClimb),
          detail: `crossed=${crossed.toFixed(2)} settled=${settled} speed=[${format(speeds)}] climb=[${format(climbs)}]`,
        };
      },
      ENTITY_TYPE[kind],
    ),
  );
}

export function suvBoostRelease(a: Arena): Promise<Outcome> {
  return boostRelease(a, "suv");
}

export function camperBoostRelease(
  a: Arena,
  onStep: StepSink,
): Promise<Outcome> {
  return boostRelease(a, "camper", onStep);
}

export function scooterBoostRelease(a: Arena): Promise<Outcome> {
  return boostRelease(a, "scooter");
}

export function bulldozerBoostRelease(a: Arena): Promise<Outcome> {
  return boostRelease(a, "bulldozer");
}
