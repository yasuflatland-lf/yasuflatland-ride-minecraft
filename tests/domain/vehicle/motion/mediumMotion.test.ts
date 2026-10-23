import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  clamp,
  dot,
  forward,
  length,
  type Vec2,
} from "../../../../src/domain/shared/vec";
import { toDriveInput } from "../../../../src/domain/vehicle/driveInput";
import { afloatInput } from "../../../../src/domain/vehicle/kinds/sportsboat/drive";
import { SPORTSBOAT_MOTION } from "../../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../../src/domain/vehicle/kinds/sportsboat/spec";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../../src/domain/vehicle/kinds/suv/profile";
import { AIR, SUV_SPEC } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import type { MotionLimits } from "../../../../src/domain/vehicle/motion/limits";
import type { GroundInput } from "../../../../src/domain/vehicle/motion/motion";
import {
  blockedAxes,
  initialMotion,
  type Medium,
  type MotionResult,
  type MotionState,
  speedAfterWall,
  stepMediumMotion,
  updateSpeed,
} from "../../../../src/domain/vehicle/motion/motion";

const NEUTRAL_GROUND: GroundInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  creep: false,
};

// The in-game flight_cruise test checks this assumption against the engine.
const ENGINE_DRAG = SUV_SPEC.flightDrag;
const FULL_THROTTLE: GroundInput = {
  throttle: 1,
  steer: 0,
  handbrake: false,
  creep: false,
};

function fly(inputs: readonly GroundInput[]): { r: MotionResult; vel: Vec2 }[] {
  let state = initialMotion(0);
  let vel: Vec2 = { x: 0, z: 0 };
  return inputs.map((input) => {
    const r = stepMediumMotion(
      state,
      input,
      vel,
      AIR,
      SUV_MOTION,
      SUV_TYRES.creepSpeed,
    );
    state = r.state;
    vel = {
      x: (vel.x + r.impulse.x) * ENGINE_DRAG,
      z: (vel.z + r.impulse.z) * ENGINE_DRAG,
    };
    return { r, vel };
  });
}

const driveInput = fc.record({
  throttle: fc.double({ min: -1, max: 1, noNaN: true }),
  steer: fc.double({ min: -1, max: 1, noNaN: true }),
  handbrake: fc.boolean(),
  creep: fc.boolean(),
});
const inputs = fc.array(driveInput, { minLength: 1, maxLength: 300 });
const component = fc.double({ min: -2, max: 2, noNaN: true });
const vec = fc.record({ x: component, z: component });
const flyingState = fc.record({
  speed: fc.double({
    min: -SUV_SPEC.maxReverse,
    max: SUV_SPEC.maxSpeed,
    noNaN: true,
  }),
  yaw: fc.double({ min: -180, max: 180, noNaN: true }),
  mediumExpected: vec,
});
const prevState = (s: {
  speed: number;
  yaw: number;
  mediumExpected: Vec2;
}): MotionState => ({ ...s, stepTicks: 0 });

describe("stepMediumMotion (ADR 0021, 0075)", () => {
  const positive = fc.double({ min: 0.01, max: 4, noNaN: true });
  const unit = fc.double({ min: 0, max: 1, noNaN: true });
  const limitsArb: fc.Arbitrary<MotionLimits> = fc.record({
    maxSpeed: positive,
    maxReverse: positive,
    accel: positive,
    reverseAccel: positive,
    brake: positive,
    drag: positive,
    turnRate: positive,
    steerFullSpeed: positive,
    grip: unit,
  });
  const mediumArb: fc.Arbitrary<Medium> = fc.record({
    drag: positive,
    maxSpeed: positive,
  });
  const ratioAboveOne = fc.double({ min: 1.01, max: 4, noNaN: true });
  const reverseRatio = fc.oneof(
    fc.double({ min: 0.01, max: 1, noNaN: true }),
    ratioAboveOne,
  );

  it("caps internal speed in both directions after every medium tick", () => {
    fc.assert(
      fc.property(
        limitsArb,
        mediumArb,
        reverseRatio,
        component,
        flyingState,
        positive,
        fc.array(fc.record({ input: driveInput, velocity: vec }), {
          minLength: 1,
          maxLength: 300,
        }),
        (base, medium, ratio, speedFraction, prev, creepSpeed, ticks) => {
          const limits: MotionLimits = {
            ...base,
            maxReverse: medium.maxSpeed * ratio,
          };
          const cap = Math.min(limits.maxSpeed, medium.maxSpeed);
          let state: MotionState = {
            ...prevState(prev),
            speed: (speedFraction / 2) * cap,
          };
          for (const { input, velocity } of ticks) {
            state = stepMediumMotion(
              state,
              input,
              velocity,
              medium,
              limits,
              creepSpeed,
            ).state;
            expect(Math.abs(state.speed)).toBeLessThanOrEqual(cap + 1e-9);
          }
        },
      ),
    );
  });

  it("reaches exactly the medium cap when holding full reverse from rest", () => {
    fc.assert(
      fc.property(
        limitsArb,
        mediumArb,
        ratioAboveOne,
        (base, medium, ratio) => {
          const limits: MotionLimits = {
            ...base,
            maxSpeed: Math.max(base.maxSpeed, medium.maxSpeed),
            maxReverse: medium.maxSpeed * ratio,
          };
          let state = initialMotion(0);
          let velocity = { x: 0, z: 0 };
          const ticks = Math.ceil(limits.maxReverse / limits.reverseAccel) + 1;
          for (let tick = 0; tick < ticks; tick++) {
            const result = stepMediumMotion(
              state,
              { throttle: -1, steer: 0, creep: false },
              velocity,
              medium,
              limits,
              0,
            );
            state = result.state;
            velocity = {
              x: (velocity.x + result.impulse.x) * medium.drag,
              z: (velocity.z + result.impulse.z) * medium.drag,
            };
          }
          expect(state.speed).toBe(-medium.maxSpeed);
        },
      ),
    );
  });

  it("preserves reverse speed when the medium cap does not bind", () => {
    fc.assert(
      fc.property(
        limitsArb,
        mediumArb,
        unit,
        driveInput,
        vec,
        positive,
        (base, medium, fraction, input, velocity, creepSpeed) => {
          const cap = Math.min(base.maxSpeed, medium.maxSpeed);
          const limits: MotionLimits = {
            ...base,
            maxReverse: Math.min(base.maxReverse, cap),
          };
          const prev: MotionState = {
            ...initialMotion(0),
            speed: -limits.maxReverse + fraction * (cap + limits.maxReverse),
            mediumExpected: undefined,
          };
          const result = stepMediumMotion(
            prev,
            input,
            velocity,
            medium,
            limits,
            creepSpeed,
          );
          expect(result.blocked).toBe(false);
          expect(result.state.speed).toBe(
            clamp(
              updateSpeed(
                prev.speed,
                input.throttle,
                input.creep,
                limits,
                creepSpeed,
              ),
              -limits.maxReverse,
              cap,
            ),
          );
        },
      ),
    );
  });

  it("keeps horizontal speed within max speed", () => {
    fc.assert(
      fc.property(inputs, (ins) => {
        for (const { vel } of fly(ins))
          expect(length(vel)).toBeLessThanOrEqual(SUV_SPEC.maxSpeed + 1e-9);
      }),
    );
  });

  it("never jumps a step, never reports a wall, and keeps no ground friction bookkeeping", () => {
    fc.assert(
      fc.property(inputs, (ins) => {
        for (const { r } of fly(ins)) {
          expect(r.jumpVelocity).toBe(0);
          expect(r.blocked).toBe(false);
          expect(r.state.expected).toBeUndefined();
          expect(r.state.stepTicks).toBe(0);
        }
      }),
    );
  });

  it("ignores the handbrake", () => {
    fc.assert(
      fc.property(inputs, (ins) => {
        const off = fly(ins.map((i) => ({ ...i, handbrake: false })));
        const on = fly(ins.map((i) => ({ ...i, handbrake: true })));
        expect(on.map((f) => f.vel)).toEqual(off.map((f) => f.vel));
      }),
    );
  });

  it("reaches 95% of max speed within 45 ticks at full throttle", () => {
    const frames = fly(
      Array.from({ length: 45 }, () => ({
        throttle: 1,
        steer: 0,
        handbrake: false,
        creep: false,
      })),
    );
    const last = frames.at(-1)?.vel ?? { x: 0, z: 0 };
    expect(length(last)).toBeGreaterThanOrEqual(SUV_SPEC.maxSpeed * 0.95);
  });

  it("reports a wall and keeps the wall speed when an expected axis comes back zero (ADR 0081)", () => {
    const axisValue = fc
      .double({ min: MOTION.blockedAxisMin, max: 2, noNaN: true })
      .filter((a) => a > MOTION.blockedAxisMin)
      .chain((a) => fc.constantFrom(a, -a));
    fc.assert(
      fc.property(
        flyingState,
        driveInput,
        fc.boolean(),
        axisValue,
        component,
        (s, input, onX, stopped, other) => {
          const e = onX
            ? { x: stopped, z: s.mediumExpected.z }
            : { x: s.mediumExpected.x, z: stopped };
          const v = onX ? { x: 0, z: other } : { x: other, z: 0 };
          const r = stepMediumMotion(
            prevState({ ...s, mediumExpected: e }),
            input,
            v,
            AIR,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          );
          expect(r.blocked).toBe(true);
          const free = Math.min(
            updateSpeed(
              s.speed,
              input.throttle,
              input.creep,
              SUV_MOTION,
              SUV_TYRES.creepSpeed,
            ),
            SUV_SPEC.maxSpeed,
          );
          const axes = blockedAxes(
            v,
            e,
            (AIR.wallDrag ?? AIR.drag) * MOTION.blockedRatio,
          );
          expect(r.state.speed).toBe(
            speedAfterWall(free, v, forward(r.state.yaw), axes),
          );
        },
      ),
    );
  });

  it("does not report a wall when the velocity keeps the free-flight share of what was given", () => {
    fc.assert(
      fc.property(flyingState, driveInput, (s, input) => {
        const e = s.mediumExpected;
        const v = { x: e.x * ENGINE_DRAG, z: e.z * ENGINE_DRAG };
        const r = stepMediumMotion(
          prevState(s),
          input,
          v,
          AIR,
          SUV_MOTION,
          SUV_TYRES.creepSpeed,
        );
        expect(r.blocked).toBe(false);
        expect(r.state.speed).toBe(
          updateSpeed(
            s.speed,
            input.throttle,
            input.creep,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          ),
        );
      }),
    );
  });
});

describe("stepMediumMotion walls and sideways velocity (ADR 0002, 0003)", () => {
  it("skips an axis whose given velocity is blockedAxisMin or less, whatever comes back on it (ADR 0003)", () => {
    const small = fc.oneof(
      fc.constantFrom(MOTION.blockedAxisMin, -MOTION.blockedAxisMin, 0),
      fc.double({
        min: -MOTION.blockedAxisMin,
        max: MOTION.blockedAxisMin,
        noNaN: true,
      }),
    );
    fc.assert(
      fc.property(
        flyingState,
        driveInput,
        fc.boolean(),
        small,
        component,
        (s, input, onX, tiny, back) => {
          const e = onX
            ? { x: tiny, z: s.mediumExpected.z }
            : { x: s.mediumExpected.x, z: tiny };
          const v = onX
            ? { x: back, z: e.z * ENGINE_DRAG }
            : { x: e.x * ENGINE_DRAG, z: back };
          const r = stepMediumMotion(
            prevState({ ...s, mediumExpected: e }),
            input,
            v,
            AIR,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          );
          expect(r.blocked).toBe(false);
        },
      ),
    );
  });

  it("does not report a wall when an axis keeps exactly half the drag share (ADR 0003)", () => {
    const kept = SUV_SPEC.flightDrag * MOTION.blockedRatio;
    const r = stepMediumMotion(
      prevState({ speed: 0.5, yaw: 0, mediumExpected: { x: 1, z: 1 } }),
      { throttle: 0, steer: 0, creep: false },
      { x: kept, z: kept },
      AIR,
      SUV_MOTION,
      SUV_TYRES.creepSpeed,
    );
    expect(r.blocked).toBe(false);
  });

  it("reports a wall when the velocity comes back reversed on an axis (ADR 0003)", () => {
    const r = stepMediumMotion(
      prevState({ speed: 0.5, yaw: 0, mediumExpected: { x: 1, z: 1 } }),
      { throttle: 0, steer: 0, creep: false },
      { x: -0.5, z: ENGINE_DRAG },
      AIR,
      SUV_MOTION,
      SUV_TYRES.creepSpeed,
    );
    expect(r.blocked).toBe(true);
  });

  it("a wall never raises the internal speed (ADR 0003)", () => {
    fc.assert(
      fc.property(
        flyingState,
        driveInput,
        fc.boolean(),
        component,
        component,
        (s, input, onX, stopped, other) => {
          fc.pre(Math.abs(stopped) > MOTION.blockedAxisMin);
          const e = onX
            ? { x: stopped, z: s.mediumExpected.z }
            : { x: s.mediumExpected.x, z: stopped };
          const v = onX ? { x: 0, z: other } : { x: other, z: 0 };
          const r = stepMediumMotion(
            prevState({ ...s, mediumExpected: e }),
            input,
            v,
            AIR,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          );
          const free = Math.min(
            updateSpeed(
              s.speed,
              input.throttle,
              input.creep,
              SUV_MOTION,
              SUV_TYRES.creepSpeed,
            ),
            SUV_SPEC.maxSpeed,
          );
          expect(Math.abs(r.state.speed)).toBeLessThanOrEqual(
            Math.abs(free) + 1e-12,
          );
        },
      ),
    );
  });

  it("a wall tick never flips the sign of the internal speed (ADR 0077)", () => {
    fc.assert(
      fc.property(
        flyingState,
        driveInput,
        fc.boolean(),
        component,
        component,
        (s, input, onX, stopped, other) => {
          fc.pre(Math.abs(stopped) > MOTION.blockedAxisMin);
          const e = onX
            ? { x: stopped, z: s.mediumExpected.z }
            : { x: s.mediumExpected.x, z: stopped };
          const v = onX ? { x: 0, z: other } : { x: other, z: 0 };
          const r = stepMediumMotion(
            prevState({ ...s, mediumExpected: e }),
            input,
            v,
            AIR,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          );
          const free = Math.min(
            updateSpeed(
              s.speed,
              input.throttle,
              input.creep,
              SUV_MOTION,
              SUV_TYRES.creepSpeed,
            ),
            SUV_SPEC.maxSpeed,
          );
          expect(r.blocked).toBe(true);
          expect(Math.sign(r.state.speed) * Math.sign(free)).not.toBe(-1);
        },
      ),
    );
  });

  it("a wall that bounces a body backward stops it at 0 instead of reversing (ADR 0077)", () => {
    const r = stepMediumMotion(
      prevState({ speed: 0.1, yaw: -180, mediumExpected: { x: 0, z: -0.5 } }),
      { throttle: 0, steer: 0, creep: false },
      { x: 0, z: 0.05 },
      AIR,
      SUV_MOTION,
      SUV_TYRES.creepSpeed,
    );
    expect(r.blocked).toBe(true);
    expect(r.state.speed).toBe(0);
  });

  it("slides along a wall hit at an angle in a medium (ADR 0081)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 85 }), (theta) => {
        let state = initialMotion(-90 + theta);
        let vel: Vec2 = { x: 0, z: 0 };
        let impact = 0;
        for (let t = 0; t < 120; t++) {
          const r = stepMediumMotion(
            state,
            FULL_THROTTLE,
            vel,
            AIR,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          );
          state = r.state;
          const x = t >= 60 ? 0 : vel.x + r.impulse.x;
          vel = {
            x: x * ENGINE_DRAG,
            z: (vel.z + r.impulse.z) * ENGINE_DRAG,
          };
          if (t === 60) impact = vel.z;
          if (t > 60) {
            expect(r.blocked).toBe(true);
            expect(Math.abs(vel.z - impact)).toBeLessThanOrEqual(1e-6);
            expect(r.state.speed).toBeGreaterThan(0);
          }
        }
        expect(impact).toBeGreaterThan(0);
      }),
    );
  });

  it("aims for the internal speed forward and keeps 1 - grip of the sideways velocity (ADR 0002)", () => {
    const small = fc.integer({ min: -300, max: 300 }).map((n) => n / 1000);
    fc.assert(
      fc.property(
        fc.double({ min: -SUV_SPEC.maxReverse, max: 0.5, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        driveInput,
        small,
        small,
        (speed, yaw, input, vx, vz) => {
          const v = { x: vx, z: vz };
          const r = stepMediumMotion(
            { speed, yaw, stepTicks: 0 },
            input,
            v,
            AIR,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          );
          const f = forward(r.state.yaw);
          const aimed = {
            x: (v.x + r.impulse.x) * ENGINE_DRAG,
            z: (v.z + r.impulse.z) * ENGINE_DRAG,
          };
          const side = (u: Vec2) => {
            const l = dot(u, f);
            return { x: u.x - f.x * l, z: u.z - f.z * l };
          };
          const keep = 1 - SUV_SPEC.grip;
          expect(dot(aimed, f)).toBeCloseTo(r.state.speed, 9);
          expect(side(aimed).x).toBeCloseTo(side(v).x * keep, 9);
          expect(side(aimed).z).toBeCloseTo(side(v).z * keep, 9);
        },
      ),
    );
  });
});

describe("light braking afloat (ADR 0074)", () => {
  const lightBack = fc.integer({ min: 101, max: 1000 }).map((n) => -n / 1000);
  const boatForwardSpeed = fc
    .integer({ min: 1, max: 10000 })
    .map((n) => (n / 10000) * SPORTSBOAT_MOTION.maxSpeed);

  it("the sports boat afloat slows at least as much under a light brake as when released", () => {
    fc.assert(
      fc.property(boatForwardSpeed, lightBack, (speed, moveY) => {
        const prev: MotionState = { speed, yaw: 0, stepTicks: 0 };
        const v = { x: 0, z: 0 };
        const medium = { drag: 0.83, maxSpeed: SPORTSBOAT_MOTION.maxSpeed };
        expect(
          stepMediumMotion(
            prev,
            afloatInput(toDriveInput({ moveX: 0, moveY, jump: false })),
            v,
            medium,
            SPORTSBOAT_MOTION,
            SPORTSBOAT_SPEC.creepSpeed,
          ).state.speed,
        ).toBeLessThanOrEqual(
          stepMediumMotion(
            prev,
            NEUTRAL_GROUND,
            v,
            medium,
            SPORTSBOAT_MOTION,
            SPORTSBOAT_SPEC.creepSpeed,
          ).state.speed,
        );
      }),
    );
  });
});
