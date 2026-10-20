import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp } from "../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { SuvDrive } from "../../../../src/domain/vehicle/kinds/suv/drive";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../../src/domain/vehicle/kinds/suv/profile";
import {
  SUV_SPEC,
  SUV_TRANSFORMING,
} from "../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import type { Form } from "../../../../src/domain/vehicle/motion/forms";
import {
  initialMotion,
  stepMotion,
} from "../../../../src/domain/vehicle/motion/motion";
import { TransformingDrive } from "../../../../src/domain/vehicle/motion/transformingDrive";
import { SPEC } from "../../../../src/domain/vehicle/spec";
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
    blockTypes: () => [],
    solidAt: (offset) => offset.y < 0,
  };
}

it("uses the supplied car height to decide whether the roof is submerged", () => {
  const tall = new TransformingDrive(
    0,
    {},
    { ...SUV_TRANSFORMING, carHeight: 4 },
    SUV_MOTION,
    SUV_TYRES,
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
      const drive = new TransformingDrive(
        0,
        {},
        SUV_TRANSFORMING,
        limits,
        SUV_TYRES,
      );
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
  const drive = new TransformingDrive(
    0,
    {},
    SUV_TRANSFORMING,
    SUV_MOTION,
    SUV_TYRES,
  );
  expect(drive.onSeatVacated(0)).toStrictEqual([]);
});

it("keeps the SUV's door animation and sound when a seat is vacated", () => {
  expect(new SuvDrive(0, {}).onSeatVacated(0)).toStrictEqual([
    { type: "playAnimation", name: "door_fr" },
    { type: "playSound", name: "random.door_open" },
  ]);
});

// The mapping before ADR 0089, kept as an oracle.
interface LegacyDriveInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
  creep: boolean;
}
const LEGACY_NEUTRAL: LegacyDriveInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  creep: false,
};
const LEGACY_SLOPE = Math.tan((SPEC.sidewaysAngle * Math.PI) / 180);
function legacyToDriveInput(raw: RawInput | undefined): LegacyDriveInput {
  if (
    raw === undefined ||
    !Number.isFinite(raw.moveX) ||
    !Number.isFinite(raw.moveY)
  ) {
    return LEGACY_NEUTRAL;
  }
  const steer = clamp(raw.moveX, -1, 1);
  const sideways = Math.abs(steer);
  // A phone stick pushed straight right reads about -0.2 forward/backward,
  // which would otherwise reverse the vehicle and flip the steering.
  if (
    sideways > SPEC.throttleDeadzone &&
    Math.abs(raw.moveY) <= sideways * LEGACY_SLOPE
  ) {
    return { throttle: 0, steer, handbrake: raw.jump, creep: true };
  }
  const magnitude = Math.abs(raw.moveY);
  const throttle =
    magnitude <= SPEC.throttleDeadzone
      ? 0
      : Math.sign(raw.moveY) * Math.min(1, magnitude / SPEC.throttleFullAt);
  return { throttle, steer, handbrake: raw.jump, creep: false };
}

function legacyDriveInputFor(
  raw: RawInput | undefined,
  form: Form,
): LegacyDriveInput {
  if (form === "takeoff") return LEGACY_NEUTRAL;
  const input = legacyToDriveInput(raw);
  if (form === "car") return input;
  return { ...input, throttle: Math.max(0, input.throttle), handbrake: false };
}

const anyYaw = fc.double({ min: -180, max: 180, noNaN: true });

const LEGACY_SUV = {
  maxSpeed: SUV_SPEC.maxSpeed,
  maxReverse: SUV_SPEC.maxReverse,
  accel: SUV_SPEC.accel,
  reverseAccel: SUV_SPEC.reverseAccel,
  brake: SUV_SPEC.brake,
  drag: SUV_SPEC.drag,
  turnRate: SUV_SPEC.turnRate,
  steerFullSpeed: SUV_SPEC.steerFullSpeed,
  grip: SUV_SPEC.grip,
  handbrakeGrip: SUV_SPEC.handbrakeGrip,
  creepSpeed: SUV_SPEC.creepSpeed,
};

it("an SUV in car form drives tick by tick as the old mapping did (ADR 0089)", () => {
  fc.assert(
    fc.property(
      anyYaw,
      fc.boolean(),
      fc.array(
        fc.record({
          moveX: fc.double({ min: -1, max: 1, noNaN: true }),
          moveY: fc.double({ min: -1, max: 1, noNaN: true }),
          velocity: fc.record({
            x: fc.double({ min: -2, max: 2, noNaN: true }),
            z: fc.double({ min: -2, max: 2, noNaN: true }),
          }),
        }),
        { minLength: 1, maxLength: 60 },
      ),
      (heading, jump, ticks) => {
        const drive = new SuvDrive(heading, {});
        let oracle = initialMotion(heading);
        ticks.forEach(({ moveX, moveY, velocity }, i) => {
          const raw = { moveX, moveY, jump };
          const ctx: TickContext = {
            ...context(),
            tick: i,
            velocity: { x: velocity.x, y: 0, z: velocity.z },
            onGround: true,
            // No obstacle, matching the oracle's step probe.
            solidAt: () => false,
          };
          const out = drive.step(raw, ctx);
          const o = stepMotion(
            oracle,
            legacyDriveInputFor(raw, "car"),
            { velocity, onGround: true },
            () => 0,
            LEGACY_SUV,
            LEGACY_SUV,
          );
          expect(drive.form).toBe("car");
          expect(drive.speed).toBe(o.state.speed);
          expect(drive.yaw).toBe(o.state.yaw);
          expect(out.impulse.x).toBe(o.impulse.x);
          expect(out.impulse.z).toBe(o.impulse.z);
          oracle = o.state;
        });
      },
    ),
    { numRuns: 100 },
  );
});
