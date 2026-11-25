import { type Entity, system } from "@minecraft/server";
import { BULLDOZER_SPEC } from "../../../domain/vehicle/kinds/bulldozer/spec";
import { CAMPER_SPEC } from "../../../domain/vehicle/kinds/camper/spec";
import { SCOOTER_SPEC } from "../../../domain/vehicle/kinds/scooter/spec";
import { SUV_SPEC } from "../../../domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../domain/vehicle/motion/constants";
import { TEST_BOOST_EVENT } from "../../../infrastructure/vehicle/testHooks/identifiers";
import { type Arena, blockLoaded, drive, wait, waitUntil } from "../../arena";
import { areaBounds, runwayArea } from "../../lane";
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

/** Temporarily reshape this lane's ticking area so even a camper can reach cruise from rest. */
export async function withBoostRunway<T>(
  a: Arena,
  run: () => Promise<T>,
): Promise<T> {
  const name = a.lane.tickingArea;
  const restore = areaBounds(a.lane);
  const runway = runwayArea(a.lane);
  async function replace(
    oldName: string,
    newName: string,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
  ) {
    for (const area of [oldName, newName]) {
      try {
        a.dim.runCommand(`tickingarea remove ${area}`);
      } catch {
        // A prior interrupted replacement may have left either name or neither.
      }
    }
    await wait(2);
    const result = a.dim.runCommand(
      `tickingarea add ${x1} -64 ${z1} ${x2} 0 ${z2} ${newName} true`,
    );
    if (!result.successCount) throw new Error(`Failed to add ${newName}`);
    const loaded = await waitUntil(200, () =>
      [x1, x2].every((x) =>
        [z1, z2].every((z) => blockLoaded(a.dim, { x, y: a.gy, z })),
      ),
    );
    if (!loaded) throw new Error(`Corners not loaded for ${newName}`);
  }
  // Two chunks wide and 35 long fits Bedrock's 100-chunk ticking area limit.
  const start = a.at(16, a.gy, 0);
  const end = a.at(47, a.gy, 550);
  try {
    await replace(name, runway, start.x, start.z, end.x, end.z);
    for (let z = 0; z <= 550; z += 100) {
      const last = Math.min(z + 99, 550);
      a.dim.runCommand(`fill ${a.box(28, a.gy, z, 36, a.gy + 10, last)} air`);
      a.dim.runCommand(
        `fill ${a.box(28, a.gy - 1, z, 36, a.gy - 1, last)} stone`,
      );
    }
    return await run();
  } finally {
    await replace(
      runway,
      name,
      restore.minX,
      restore.minZ,
      restore.maxX,
      restore.maxZ,
    );
  }
}
