import { system } from "@minecraft/server";
import { MOTION } from "../../domain/vehicle/motion/constants";
import { ENTITY_TYPE } from "../../infrastructure/vehicle/bedrock/identifiers";
import { TEST_HELD_ITEM_EVENT } from "../../infrastructure/vehicle/testHooks/identifiers";
import { type Arena, wait, withCar } from "../arena";
import type { Outcome, StepSink } from "../outcome";
import { setBlade, setRoadPaver } from "./bulldozer";
import { vehicleForm } from "./shared";
import {
  boostSpecs,
  type FlyingKind,
  reachBoostCruise,
  withBoostRunway,
} from "./support/boosterRunway";

const TRACK_X = 32.5;
function boostedWall(
  a: Arena,
  kind: FlyingKind,
  onStep?: StepSink,
): Promise<Outcome> {
  return withBoostRunway(a, () =>
    withCar(
      a,
      TRACK_X,
      8.5,
      0,
      async (car) => {
        await reachBoostCruise(car, kind, onStep);
        const start = a.local(car.location);
        // Ninety-six blocks give every kind six chunk borders at cruise before impact.
        const wall = Math.ceil(start.z) + 96;
        // The camper probes its bumper ahead of the engine collision box (ADR 0067).
        const front =
          kind === "camper"
            ? boostSpecs.camper.bodyFront
            : boostSpecs[kind].hitboxFront;
        const box = a.box(29, a.gy, wall, 35, a.gy + 7, wall);
        const peak = boostSpecs[kind].maxSpeed * MOTION.boostFlightScale;
        try {
          a.dim.runCommand(`fill ${box} stone`);
          let z = start.z;
          let approachSpeed = 0;
          let heldAtWall = 0;
          for (let tick = 0; tick < Math.ceil(96 / peak) + 42; tick++) {
            await wait(1);
            if (!car.isValid)
              return { pass: false, detail: `lost after z=${z}` };
            const p = a.local(car.location);
            if (
              vehicleForm(car) !== "hover" ||
              Math.abs(p.y - start.y) > 0.5 ||
              Math.abs(p.x - TRACK_X) > 0.25 ||
              p.z + front > wall + 0.05
            )
              return {
                pass: false,
                detail: `left flight path: position=${JSON.stringify(p)} wall=${wall}`,
              };
            z = p.z;
            if (z + front >= wall - 20 && z + front <= wall - 12)
              approachSpeed = car.getVelocity().z;
            heldAtWall = z + front >= wall - 0.25 ? heldAtWall + 1 : 0;
            if (heldAtWall >= 8) break;
          }
          return {
            pass:
              heldAtWall >= 8 &&
              approachSpeed >= peak * 0.95 &&
              a.dim.getBlock(a.at(32, Math.floor(start.y), wall))?.typeId ===
                "minecraft:stone",
            detail: `start=${start.z.toFixed(2)} wall=${wall} nose=${(z + front).toFixed(2)} heldTicks=${heldAtWall} approachSpeed=${approachSpeed.toFixed(3)} finalSpeed=${car.getVelocity().z.toFixed(3)}`,
          };
        } finally {
          a.dim.runCommand(`fill ${box} air`);
        }
      },
      ENTITY_TYPE[kind],
    ),
  );
}

export const suvBoostWall = (a: Arena) => boostedWall(a, "suv");
export const camperBoostWall = (a: Arena, onStep: StepSink) =>
  boostedWall(a, "camper", onStep);
export const scooterBoostWall = (a: Arena) => boostedWall(a, "scooter");
export const bulldozerBoostWall = (a: Arena) => boostedWall(a, "bulldozer");

export function bulldozerBoostTools(a: Arena): Promise<Outcome> {
  return withBoostRunway(a, () =>
    withCar(
      a,
      TRACK_X,
      8.5,
      0,
      async (car) => {
        await setBlade(car, false);
        await setRoadPaver(car, true);
        await reachBoostCruise(car, "bulldozer");
        const start = a.local(car.location);
        const z0 = Math.floor(start.z);
        const tunnel = z0 + 16;
        const bottom = Math.floor(start.y + 0.01);
        const top = Math.ceil(start.y + boostSpecs.bulldozer.blade.bodyHeight);
        const road = bottom - 1;
        const half = boostSpecs.bulldozer.blade.halfWidth;
        const plank = "minecraft:oak_planks";
        const peak = boostSpecs.bulldozer.maxSpeed * MOTION.boostFlightScale;
        try {
          a.dim.runCommand(
            `fill ${a.box(29, bottom, tunnel, 35, top, tunnel + 5)} stone`,
          );
          system.sendScriptEvent(TEST_HELD_ITEM_EVENT, `${car.id},${plank}`);
          let minSpeed = Infinity;
          for (
            let tick = 0;
            tick < 45 && a.local(car.location).z < z0 + 45;
            tick++
          ) {
            await wait(1);
            minSpeed = Math.min(minSpeed, car.getVelocity().z);
          }
          const end = a.local(car.location);
          let wrong = 0;
          let first = "";
          function check(x: number, y: number, z: number, expected: string) {
            const actual = a.dim.getBlock(a.at(x, y, z))?.typeId;
            if (actual !== expected) {
              wrong++;
              if (!first)
                first = `${x},${y},${z}: ${actual} expected ${expected}`;
            }
          }
          for (let x = 29; x <= 35; x++) {
            const inStrip =
              x >= Math.floor(TRACK_X - half) &&
              x <= Math.floor(TRACK_X + half);
            for (let z = tunnel; z <= tunnel + 5; z++)
              for (let y = bottom; y <= top; y++)
                check(
                  x,
                  y,
                  z,
                  inStrip && y < top ? "minecraft:air" : "minecraft:stone",
                );
            for (let z = z0 + 4; z <= Math.floor(end.z) - 8; z++)
              check(x, road, z, inStrip ? plank : "minecraft:air");
            for (let z = Math.floor(end.z); z <= Math.floor(end.z) + 3; z++)
              check(x, road, z, "minecraft:air");
          }
          return {
            pass:
              vehicleForm(car) === "hover" &&
              end.z >= z0 + 45 &&
              minSpeed >= peak * 0.95 &&
              wrong === 0,
            detail: `z=${start.z.toFixed(2)}..${end.z.toFixed(2)} minSpeed=${minSpeed.toFixed(3)} wrong=${wrong} ${first}`,
          };
        } finally {
          a.dim.runCommand(
            `fill ${a.box(29, road, z0 - 6, 35, top, z0 + 52)} air`,
          );
        }
      },
      ENTITY_TYPE.bulldozer,
    ),
  );
}
