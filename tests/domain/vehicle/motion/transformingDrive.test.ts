import fc from "fast-check";
import { expect, it } from "vitest";
import type { TickContext } from "../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { SuvDrive } from "../../../../src/domain/vehicle/kinds/suv/drive";
import { SUV_MOTION } from "../../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import { TransformingDrive } from "../../../../src/domain/vehicle/motion/transformingDrive";
import { type Body, engineStep } from "../../../support/engineModel";
import { waterSensors } from "../../../support/waterDepth";

const IDLE: RawInput = { moveX: 0, moveY: 0, jump: false };
const FORWARD: RawInput = { ...IDLE, moveY: 1 };

function context(depth = 0): TickContext {
  return {
    tick: 0,
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    ...waterSensors(depth),
    solidAt: (offset) => offset.y < 0,
    targets: () => [],
  };
}

it("uses the supplied car height to decide whether the roof is submerged", () => {
  const tall = new TransformingDrive(
    0,
    {},
    { ...SUV_TRANSFORMING, carHeight: 4 },
    SUV_MOTION,
  );
  const suv = new SuvDrive(0, {});
  tall.step(IDLE, context(2));
  suv.step(IDLE, context(2));
  expect(tall.form).toBe("car");
  expect(suv.form).toBe("submarine");
});

it("keeps car speed within the supplied limits throughout 300 forward ticks", () => {
  fc.assert(
    fc.property(fc.double({ min: 0.2, max: 1.5, noNaN: true }), (maxSpeed) => {
      const limits = { ...SUV_MOTION, maxSpeed };
      const drive = new TransformingDrive(0, {}, SUV_TRANSFORMING, limits);
      let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
      for (let tick = 0; tick < 300; tick++) {
        const out = drive.step(FORWARD, {
          ...context(),
          tick,
          velocity: { ...body.vel, y: 0 },
        });
        expect(drive.form).toBe("car");
        expect(drive.speed).toBeLessThanOrEqual(limits.maxSpeed);
        body = engineStep(body, out.impulse, {
          mu: MOTION.defaultFriction,
        }).body;
      }
      expect(drive.speed).toBeCloseTo(limits.maxSpeed, 9);
    }),
  );
});

it("has no seat commands by default", () => {
  const drive = new TransformingDrive(0, {}, SUV_TRANSFORMING, SUV_MOTION);
  expect(drive.onSeatVacated(0)).toStrictEqual([]);
});

it("keeps the SUV's door animation and sound when a seat is vacated", () => {
  expect(new SuvDrive(0, {}).onSeatVacated(0)).toStrictEqual([
    { type: "playAnimation", name: "door_fr" },
    { type: "playSound", name: "random.door_open" },
  ]);
});
