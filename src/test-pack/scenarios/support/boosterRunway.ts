import { type Entity, system } from "@minecraft/server";
import { BULLDOZER_SPEC } from "../../../domain/vehicle/kinds/bulldozer/spec";
import { CAMPER_SPEC } from "../../../domain/vehicle/kinds/camper/spec";
import { SCOOTER_SPEC } from "../../../domain/vehicle/kinds/scooter/spec";
import { SUV_SPEC } from "../../../domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../domain/vehicle/motion/constants";
import { TEST_BOOST_EVENT } from "../../../infrastructure/vehicle/testHooks/identifiers";
import { type Arena, drive, wait, waitUntil } from "../../arena";
import { BOOST_RUNWAY_BOUNDS } from "../../lane";
import type { StepSink } from "../../outcome";
import { takeOff } from "../shared";

export const boostSpecs = {
  suv: SUV_SPEC,
  camper: CAMPER_SPEC,
  scooter: SCOOTER_SPEC,
  bulldozer: BULLDOZER_SPEC,
};

export type FlyingKind = keyof typeof boostSpecs;

export async function reachBoostCruise(
  car: Entity,
  kind: FlyingKind,
  onStep?: StepSink,
): Promise<void> {
  const spec = boostSpecs[kind];
  const peak = spec.maxSpeed * MOTION.boostFlightScale;
  await wait(3);
  await takeOff(car, spec.takeoffTicks);
  system.sendScriptEvent(TEST_BOOST_EVENT, `${car.id},on`);
  drive(car, 0, 1);
  const reached = await waitUntil(
    Math.ceil(peak / spec.accel) + 12,
    () => car.getVelocity().z >= peak * 0.98,
  );
  const detail = `vz=${car.getVelocity().z.toFixed(3)} expected=${peak.toFixed(3)}`;
  onStep?.({ name: "boost_cruise", pass: reached, detail });
  if (!reached) throw new Error(`Cruise not reached: ${detail}`);
}

const occupiedRunways = new WeakSet<Arena>();

export async function withBoostRunway<T>(
  a: Arena,
  run: (runway: Arena) => Promise<T>,
): Promise<T> {
  if (a.boostRunways.length === 0) throw new Error("No boost runway prepared");
  const available = () =>
    a.boostRunways.find((runway) => !occupiedRunways.has(runway));
  let runway = available();
  while (!runway) {
    await wait(1);
    runway = available();
  }

  occupiedRunways.add(runway);
  try {
    const { minZ, maxZ } = BOOST_RUNWAY_BOUNDS;
    for (let z = minZ; z <= maxZ; z += 100) {
      const last = Math.min(z + 99, maxZ);
      runway.dim.runCommand(
        `fill ${runway.box(28, a.gy, z, 36, a.gy + 10, last)} air`,
      );
      runway.dim.runCommand(
        `fill ${runway.box(28, a.gy - 1, z, 36, a.gy - 1, last)} stone`,
      );
    }
    return await run(runway);
  } finally {
    occupiedRunways.delete(runway);
  }
}
