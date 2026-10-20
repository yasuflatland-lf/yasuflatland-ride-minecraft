import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  clamp,
  clampLength,
  dot,
  forward,
  length,
  normalizeYaw,
  type Vec2,
} from "../../../../src/domain/shared/vec";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { toDriveInput } from "../../../../src/domain/vehicle/driveInput";
import {
  CAMPER_MOTION,
  CAMPER_TYRES,
} from "../../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_SPEC } from "../../../../src/domain/vehicle/kinds/camper/spec";
import { SPORTSBOAT_MOTION } from "../../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../../src/domain/vehicle/kinds/sportsboat/spec";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import type { Form } from "../../../../src/domain/vehicle/motion/forms";
import { FORMS } from "../../../../src/domain/vehicle/motion/forms";
import type { MotionLimits } from "../../../../src/domain/vehicle/motion/limits";
import type { GroundInput } from "../../../../src/domain/vehicle/motion/motion";
import {
  alignOnMount,
  blockedAxes,
  groundWallAxes,
  hitWall,
  initialMotion,
  type MotionState,
  speedAfterWall,
  steerYaw,
  stepMediumMotion,
  stepMotion,
  updateSpeed,
} from "../../../../src/domain/vehicle/motion/motion";
import { groundInputFor } from "../../../../src/domain/vehicle/motion/transformingDrive";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { defined } from "../../../support/defined";
import {
  type Body,
  type Engine,
  engineStep,
} from "../../../support/engineModel";

const NEUTRAL_GROUND: GroundInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  creep: false,
};

const FULL_THROTTLE: GroundInput = {
  throttle: 1,
  steer: 0,
  handbrake: false,
  creep: false,
};

function repeat(input: GroundInput, ticks: number): GroundInput[] {
  return Array.from({ length: ticks }, () => input);
}

interface Frame {
  state: MotionState;
  body: Body;
  blocked: boolean;
  jumpVelocity: number;
  onGround: boolean;
  touching: boolean;
}

/** Per-tick terrain: whether the vehicle is on the ground and whether a step lies ahead. */
interface Terrain {
  onGround: boolean;
  step: boolean;
}
const FLAT: Terrain = { onGround: true, step: false };

function simulate(
  inputs: GroundInput[],
  engine: Engine,
  yaw0 = 0,
  terrain: readonly Terrain[] = [],
): Frame[] {
  let state = initialMotion(yaw0);
  let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const frames: Frame[] = [];
  inputs.forEach((input, i) => {
    const t = terrain[i] ?? FLAT;
    const r = stepMotion(
      state,
      input,
      { velocity: body.vel, onGround: t.onGround },
      () => (t.step ? 2 : 0),
      SUV_MOTION,
      SUV_TYRES,
    );
    state = r.state;
    const e = engineStep(body, r.impulse, engine, t.onGround);
    body = e.body;
    frames.push({
      state,
      body,
      blocked: r.blocked,
      jumpVelocity: r.jumpVelocity,
      onGround: t.onGround,
      touching: e.touching,
    });
  });
  return frames;
}

function lateral(v: Vec2, yaw: number): number {
  const f = forward(yaw);
  const l = dot(v, f);
  return Math.hypot(v.x - f.x * l, v.z - f.z * l);
}

interface WallFrame {
  blocked: boolean;
  speed: number;
  friction: number | undefined;
  along: number;
}

/**
 * Full throttle at a wall whose normal is +x, heading theta degrees off that
 * normal: forward(-90 + theta) = (cos theta, sin theta). The engine keeps k of
 * the velocity and, from tick `free` on, zeroes x as a wall does (ADR 0003).
 */
function driveAtWall(
  theta: number,
  k: number,
  free = 60,
  contact = 60,
): WallFrame[] {
  let state = initialMotion(-90 + theta);
  let vel: Vec2 = { x: 0, z: 0 };
  const frames: WallFrame[] = [];
  for (let t = 0; t < free + contact; t++) {
    const r = stepMotion(
      state,
      FULL_THROTTLE,
      { velocity: vel, onGround: true },
      () => 0,
      SUV_MOTION,
      SUV_TYRES,
    );
    state = r.state;
    const x = t >= free ? 0 : vel.x + r.impulse.x;
    vel = { x: x * k, z: (vel.z + r.impulse.z) * k };
    frames.push({
      blocked: r.blocked,
      speed: r.state.speed,
      friction: r.state.friction,
      along: vel.z,
    });
  }
  return frames;
}

const frameAt = (frames: readonly WallFrame[], i: number) =>
  defined(frames[i], `frame ${i}`);

const driveInput = fc.record({
  throttle: fc.double({ min: -1, max: 1, noNaN: true }),
  steer: fc.double({ min: -1, max: 1, noNaN: true }),
  handbrake: fc.boolean(),
  creep: fc.boolean(),
});
const inputs = fc.array(driveInput, { minLength: 1, maxLength: 300 });
const mu = fc.double({ min: 0.6, max: 0.75, noNaN: true });
// Enough speed for the friction estimate to run, which random throttle rarely builds.
const forwardInputs = inputs.map((ins) =>
  ins.map((i) => ({ ...i, throttle: Math.abs(i.throttle) })),
);
// Runs of ground and air ticks, with an occasional step ahead.
const terrain = fc
  .array(
    fc.record({
      onGround: fc.boolean(),
      step: fc.boolean(),
      ticks: fc.integer({ min: 1, max: 30 }),
    }),
    { maxLength: 30 },
  )
  .map((runs) =>
    runs.flatMap(({ onGround, step, ticks }) =>
      Array.from({ length: ticks }, (_, i) => ({
        onGround,
        step: step && i === 0,
      })),
    ),
  );

describe("alignOnMount (ADR 0019)", () => {
  it("takes the driver's yaw only below mountAlignSpeed and changes nothing else", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.oneof(
          fc.double({ min: -1, max: 1, noNaN: true }),
          fc.constantFrom(
            MOTION.mountAlignSpeed,
            -MOTION.mountAlignSpeed,
            MOTION.mountAlignSpeed * (1 - 1e-9),
            -MOTION.mountAlignSpeed * (1 - 1e-9),
            0,
          ),
        ),
        fc.option(fc.double({ min: MOTION.frictionMin, max: 1, noNaN: true }), {
          nil: undefined,
        }),
        fc.integer({ min: 0, max: MOTION.stepTicks }),
        (yaw, driverYaw, speed, friction, stepTicks) => {
          const state: MotionState = {
            ...initialMotion(yaw),
            speed,
            friction,
            stepTicks,
          };
          const out = alignOnMount(state, driverYaw);
          expect(out).toStrictEqual({
            ...state,
            yaw:
              Math.abs(speed) < MOTION.mountAlignSpeed
                ? normalizeYaw(driverYaw)
                : state.yaw,
          });
        },
      ),
    );
  });

  it("stores the driver's yaw normalized into (-180, 180] below mountAlignSpeed", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc
          .double({
            min: -MOTION.mountAlignSpeed,
            max: MOTION.mountAlignSpeed,
            noNaN: true,
          })
          .filter((s) => Math.abs(s) < MOTION.mountAlignSpeed),
        fc.integer({ min: -720000, max: 720000 }).map((n) => n / 1000),
        (yaw, speed, driverYaw) => {
          const state: MotionState = { ...initialMotion(yaw), speed };
          const out = alignOnMount(state, driverYaw);
          expect(out.yaw).toBeGreaterThan(-180);
          expect(out.yaw).toBeLessThanOrEqual(180);
          expect(out.yaw).toBe(normalizeYaw(driverYaw));
          expect(out).toStrictEqual({ ...state, yaw: normalizeYaw(driverYaw) });
        },
      ),
    );
  });

  it("returns the same state object at or above mountAlignSpeed", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.oneof(
          fc.double({ min: MOTION.mountAlignSpeed, max: 1, noNaN: true }),
          fc.double({ min: -1, max: -MOTION.mountAlignSpeed, noNaN: true }),
        ),
        fc.integer({ min: -720000, max: 720000 }).map((n) => n / 1000),
        (yaw, speed, driverYaw) => {
          const state: MotionState = { ...initialMotion(yaw), speed };
          expect(alignOnMount(state, driverYaw)).toBe(state);
        },
      ),
    );
  });

  it("normalizes an out-of-range driver yaw", () => {
    expect(alignOnMount(initialMotion(0), 270).yaw).toBe(-90);
    expect(alignOnMount(initialMotion(0), -180).yaw).toBe(180);
  });
});

describe("updateSpeed / steerYaw", () => {
  const forwardThrottle = fc.double({
    min: 0,
    max: 1,
    minExcluded: true,
    noNaN: true,
  });
  // maxExcluded still yields -0, which coasts instead of applying reverse throttle.
  const reverseThrottle = fc
    .double({ min: -1, max: 0, maxExcluded: true, noNaN: true })
    .filter((t) => t < 0);

  it("reaches 95% of max speed in about 40 ticks at full throttle", () => {
    let s = 0;
    let t = 0;
    while (s < SUV_SPEC.maxSpeed * 0.95) {
      s = updateSpeed(s, 1, false, SUV_MOTION, SUV_TYRES.creepSpeed);
      t++;
    }
    expect(t).toBeGreaterThanOrEqual(35);
    expect(t).toBeLessThanOrEqual(42);
  });

  it("coasts to a stop without input and without reversing the sign of speed", () => {
    let s: number = SUV_SPEC.maxSpeed;
    for (let i = 0; i < 100; i++)
      s = updateSpeed(s, 0, false, SUV_MOTION, SUV_TYRES.creepSpeed);
    expect(s).toBe(0);
  });

  it("creeping speeds up to the creep speed from a stop or from reversing, and never past it", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -SUV_SPEC.maxReverse,
          max: SUV_SPEC.creepSpeed,
          noNaN: true,
        }),
        (start) => {
          let s = start;
          for (let i = 0; i < 100; i++) {
            const next = updateSpeed(
              s,
              0,
              true,
              SUV_MOTION,
              SUV_TYRES.creepSpeed,
            );
            expect(next).toBeGreaterThanOrEqual(s);
            expect(next).toBeLessThanOrEqual(SUV_SPEC.creepSpeed);
            s = next;
          }
          expect(s).toBe(SUV_SPEC.creepSpeed);
        },
      ),
    );
  });

  it("creeping above the creep speed coasts down to it, like no input, and stops there", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: SUV_SPEC.creepSpeed,
          max: SUV_SPEC.maxSpeed,
          noNaN: true,
        }),
        (start) => {
          expect(
            updateSpeed(start, 0, true, SUV_MOTION, SUV_TYRES.creepSpeed),
          ).toBe(
            Math.max(
              SUV_SPEC.creepSpeed,
              updateSpeed(start, 0, false, SUV_MOTION, SUV_TYRES.creepSpeed),
            ),
          );
          let s = start;
          for (let i = 0; i < 100; i++)
            s = updateSpeed(s, 0, true, SUV_MOTION, SUV_TYRES.creepSpeed);
          expect(s).toBe(SUV_SPEC.creepSpeed);
        },
      ),
    );
  });

  it("creeping below the creep speed changes speed as full throttle does, capped at the creep speed (ADR 0018)", () => {
    const below = fc.oneof(
      fc.constant(0),
      fc.double({
        min: -SUV_SPEC.maxReverse,
        max: SUV_SPEC.creepSpeed,
        maxExcluded: true,
        noNaN: true,
      }),
    );
    fc.assert(
      fc.property(below, (s) => {
        expect(updateSpeed(s, 0, true, SUV_MOTION, SUV_TYRES.creepSpeed)).toBe(
          Math.min(
            SUV_SPEC.creepSpeed,
            updateSpeed(s, 1, false, SUV_MOTION, SUV_TYRES.creepSpeed),
          ),
        );
      }),
    );
    expect(updateSpeed(0, 0, true, SUV_MOTION, SUV_TYRES.creepSpeed)).toBe(
      SUV_SPEC.accel,
    );
    expect(
      updateSpeed(-0.1, 0, true, SUV_MOTION, SUV_TYRES.creepSpeed),
    ).toBeCloseTo(-0.1 + SUV_SPEC.brake, 12);
  });

  it("forward throttle accelerates by accel times throttle from a standstill or moving forward, up to max speed (ADR 0002)", () => {
    const speed = fc.oneof(
      fc.constant(0),
      fc.double({ min: 0, max: SUV_SPEC.maxSpeed, noNaN: true }),
    );
    fc.assert(
      fc.property(speed, forwardThrottle, (s, t) => {
        expect(
          updateSpeed(s, t, false, SUV_MOTION, SUV_TYRES.creepSpeed),
        ).toBeCloseTo(Math.min(SUV_SPEC.maxSpeed, s + SUV_SPEC.accel * t), 12);
      }),
    );
  });

  it("forward throttle while reversing brakes by the larger of drag and brake times throttle (ADR 0002, 0074)", () => {
    // A filter, because max: 0 also yields 0 and -0, which are a standstill, not reversing.
    const speed = fc
      .double({ min: -SUV_SPEC.maxReverse, max: 0, noNaN: true })
      .filter((s) => s < 0);
    fc.assert(
      fc.property(speed, forwardThrottle, (s, t) => {
        expect(
          updateSpeed(s, t, false, SUV_MOTION, SUV_TYRES.creepSpeed),
        ).toBeCloseTo(s + Math.max(SUV_SPEC.drag, SUV_SPEC.brake * t), 12);
      }),
    );
  });

  it("reverse throttle while moving forward brakes by the larger of drag and brake times throttle (ADR 0002, 0074)", () => {
    const speed = fc
      .double({ min: 0, max: SUV_SPEC.maxSpeed, noNaN: true })
      .filter((s) => s > 0);
    fc.assert(
      fc.property(speed, reverseThrottle, (s, t) => {
        expect(
          updateSpeed(s, t, false, SUV_MOTION, SUV_TYRES.creepSpeed),
        ).toBeCloseTo(s - Math.max(SUV_SPEC.drag, SUV_SPEC.brake * -t), 12);
      }),
    );
  });

  it("reverse throttle from a standstill or reversing accelerates backward by reverseAccel times throttle, down to the reverse limit (ADR 0002)", () => {
    const speed = fc.oneof(
      fc.constant(0),
      fc.double({ min: -SUV_SPEC.maxReverse, max: 0, noNaN: true }),
    );
    fc.assert(
      fc.property(speed, reverseThrottle, (s, t) => {
        expect(
          updateSpeed(s, t, false, SUV_MOTION, SUV_TYRES.creepSpeed),
        ).toBeCloseTo(
          Math.max(-SUV_SPEC.maxReverse, s + SUV_SPEC.reverseAccel * t),
          12,
        );
      }),
    );
  });

  it("turns at the full turn rate at or above steerFullSpeed, mirrored in reverse (ADR 0002)", () => {
    const fwd = fc.double({
      min: SUV_SPEC.steerFullSpeed,
      max: SUV_SPEC.maxSpeed,
      noNaN: true,
    });
    const rev = fc.double({
      min: SUV_SPEC.steerFullSpeed,
      max: SUV_SPEC.maxReverse,
      noNaN: true,
    });
    const steer = fc.double({ min: -1, max: 1, noNaN: true });
    fc.assert(
      fc.property(fwd, rev, steer, (fwd, rev, st) => {
        expect(steerYaw(0, fwd, st, SUV_MOTION)).toBeCloseTo(
          -st * SUV_SPEC.turnRate,
          9,
        );
        expect(steerYaw(0, -rev, st, SUV_MOTION)).toBeCloseTo(
          st * SUV_SPEC.turnRate,
          9,
        );
      }),
    );
  });

  it("up to steerFullSpeed, turns forward in proportion to speed", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: SUV_SPEC.steerFullSpeed, noNaN: true }),
        (s) => {
          expect(steerYaw(0, s, 1, SUV_MOTION)).toBeCloseTo(
            (-SUV_SPEC.turnRate * s) / SUV_SPEC.steerFullSpeed,
            9,
          );
        },
      ),
    );
  });

  it("the creep speed is below the ram threshold, so creeping never damages mobs (ADR 0006)", () => {
    expect(SUV_SPEC.creepSpeed).toBeLessThan(SPEC.ramMinSpeed);
  });

  it("steering does not change heading when stopped and turns the opposite way in reverse", () => {
    expect(steerYaw(10, 0, 1, SUV_MOTION)).toBe(10);
    expect(steerYaw(10, 0.5, 1, SUV_MOTION)).toBeLessThan(10);
    expect(steerYaw(10, -0.1, 1, SUV_MOTION)).toBeGreaterThan(10);
  });

  it("keeps heading within (-180, 180] regardless of how many turns it makes", () => {
    let yaw = 0;
    for (let i = 0; i < 10_000; i++)
      yaw = steerYaw(yaw, SUV_SPEC.maxSpeed, 1, SUV_MOTION);
    expect(yaw).toBeGreaterThan(-180);
    expect(yaw).toBeLessThanOrEqual(180);
  });
});

describe("light braking (ADR 0074)", () => {
  const lightBack = fc.integer({ min: 101, max: 1000 }).map((n) => -n / 1000);
  const lightForward = fc.integer({ min: 101, max: 1000 }).map((n) => n / 1000);
  const forwardSpeed = (L: MotionLimits) =>
    fc.integer({ min: 1, max: 10000 }).map((n) => (n / 10000) * L.maxSpeed);
  const reverseSpeed = (L: MotionLimits) =>
    fc.integer({ min: 1, max: 10000 }).map((n) => -(n / 10000) * L.maxReverse);
  const KINDS = [
    ["SUV", SUV_MOTION, SUV_TYRES.creepSpeed],
    ["camper", CAMPER_MOTION, CAMPER_TYRES.creepSpeed],
    ["sports boat", SPORTSBOAT_MOTION, SPORTSBOAT_SPEC.creepSpeed],
  ] as const;

  it.each(KINDS)(
    "%s: pulling the stick back while moving forward slows at least as much as releasing it",
    (_name, L, creepSpeed) => {
      fc.assert(
        fc.property(forwardSpeed(L), lightBack, (speed, moveY) => {
          const input = toDriveInput({ moveX: 0, moveY, jump: false });
          expect(
            updateSpeed(speed, input.throttle, input.sideways, L, creepSpeed),
          ).toBeLessThanOrEqual(updateSpeed(speed, 0, false, L, creepSpeed));
        }),
      );
    },
  );

  it.each(KINDS)(
    "%s: pushing the stick forward while reversing slows at least as much as releasing it",
    (_name, L, creepSpeed) => {
      fc.assert(
        fc.property(reverseSpeed(L), lightForward, (speed, moveY) => {
          const input = toDriveInput({ moveX: 0, moveY, jump: false });
          expect(
            updateSpeed(speed, input.throttle, input.sideways, L, creepSpeed),
          ).toBeGreaterThanOrEqual(updateSpeed(speed, 0, false, L, creepSpeed));
        }),
      );
    },
  );

  it("a light brake stops the SUV from max speed no later than coasting", () => {
    const throttle = toDriveInput({
      moveX: 0,
      moveY: -0.125,
      jump: false,
    }).throttle;
    let brakeTicks = 0;
    let s: number = SUV_SPEC.maxSpeed;
    while (s > 0 && brakeTicks < 1000) {
      s = updateSpeed(s, throttle, false, SUV_MOTION, SUV_TYRES.creepSpeed);
      brakeTicks++;
    }
    let coastTicks = 0;
    s = SUV_SPEC.maxSpeed;
    while (s !== 0 && coastTicks < 1000) {
      s = updateSpeed(s, 0, false, SUV_MOTION, SUV_TYRES.creepSpeed);
      coastTicks++;
    }
    expect(coastTicks).toBe(45);
    expect(brakeTicks).toBeLessThanOrEqual(coastTicks);
  });

  it("a light brake at speed 0.5 removes drag and a full brake removes brake (ADR 0074)", () => {
    expect(
      updateSpeed(0.5, -0.25, false, SUV_MOTION, SUV_TYRES.creepSpeed),
    ).toBeCloseTo(0.48, 12);
    expect(
      updateSpeed(0.5, -1, false, SUV_MOTION, SUV_TYRES.creepSpeed),
    ).toBeCloseTo(0.46, 12);
  });
});

describe("stepMotion (properties, ADR 0002/0003)", () => {
  it("horizontal velocity stays within max speed on the ground, in the air, and over steps (up to 10% estimation error during the first 30 ticks)", () => {
    fc.assert(
      fc.property(inputs, mu, terrain, (ins, m, ter) => {
        simulate(ins, { mu: m }, 0, ter).forEach((fr, i) => {
          const limit = SUV_SPEC.maxSpeed * (i < 30 ? 1.1 : 1.02);
          expect(length(fr.body.vel)).toBeLessThanOrEqual(limit + 1e-9);
        });
      }),
    );
  });

  it("keeps internal speed between the reverse limit and max speed even when hitting a wall", () => {
    const wall = fc.option(fc.double({ min: 2, max: 20, noNaN: true }), {
      nil: undefined,
    });
    const yaw0 = fc.double({ min: -180, max: 180, noNaN: true });
    fc.assert(
      fc.property(inputs, mu, wall, yaw0, (ins, m, w, y) => {
        for (const fr of simulate(ins, { mu: m, wallX: w }, y)) {
          expect(fr.state.speed).toBeGreaterThanOrEqual(
            -SUV_SPEC.maxReverse - 1e-9,
          );
          expect(fr.state.speed).toBeLessThanOrEqual(SUV_SPEC.maxSpeed + 1e-9);
        }
      }),
    );
  });

  it("a wall tick never flips the sign of the internal speed and never raises it (ADR 0077)", () => {
    const speed = fc.double({
      min: -SUV_SPEC.maxReverse,
      max: SUV_SPEC.maxSpeed,
      noNaN: true,
    });
    const yaw = fc.double({ min: -180, max: 180, noNaN: true });
    const friction = fc.option(fc.double({ min: 0.5, max: 1, noNaN: true }), {
      nil: undefined,
    });
    const stopped = fc.double({
      min: MOTION.blockedAxisMin * 2,
      max: 2,
      noNaN: true,
    });
    const component = fc.double({ min: -2, max: 2, noNaN: true });
    fc.assert(
      fc.property(
        speed,
        yaw,
        friction,
        driveInput,
        fc.boolean(),
        stopped,
        fc.boolean(),
        component,
        component,
        (sp, y, fr, input, onX, st, negative, other, kept) => {
          const s = negative ? -st : st;
          const expected = onX ? { x: s, z: kept } : { x: kept, z: s };
          const velocity = onX ? { x: 0, z: other } : { x: other, z: 0 };
          const r = stepMotion(
            { speed: sp, yaw: y, stepTicks: 0, friction: fr, expected },
            input,
            { velocity, onGround: true },
            () => 0,
            SUV_MOTION,
            SUV_TYRES,
          );
          const free = updateSpeed(
            sp,
            input.throttle,
            input.creep,
            SUV_MOTION,
            SUV_TYRES.creepSpeed,
          );
          expect(r.blocked).toBe(true);
          expect(Math.sign(r.state.speed) * Math.sign(free)).not.toBe(-1);
          expect(Math.abs(r.state.speed)).toBeLessThanOrEqual(Math.abs(free));
        },
      ),
    );
  });

  it("a wall that bounces a forward vehicle slightly backward stops it at 0 (ADR 0077)", () => {
    const r = stepMotion(
      {
        speed: 0.1,
        yaw: 0,
        stepTicks: 0,
        friction: 0.9,
        expected: { x: 0, z: 0.5 },
      },
      NEUTRAL_GROUND,
      { velocity: { x: 0, z: -0.01 }, onGround: true },
      () => 0,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(r.blocked).toBe(true);
    expect(r.state.speed).toBe(0);
  });

  it("does not detect collisions without walls, including on landing", () => {
    fc.assert(
      fc.property(inputs, mu, terrain, (ins, m, ter) => {
        for (const fr of simulate(ins, { mu: m }, 0, ter))
          expect(fr.blocked).toBe(false);
      }),
    );
  });

  it("updates the friction estimate only when this tick and the previous one were on the ground", () => {
    fc.assert(
      fc.property(forwardInputs, mu, terrain, (ins, m, ter) => {
        const frames = simulate(ins, { mu: m }, 0, ter);
        frames.forEach((fr, i) => {
          const prev = frames[i - 1];
          if (prev && !(prev.onGround && fr.onGround))
            expect(fr.state.friction).toBe(prev.state.friction);
        });
      }),
    );
  });

  it("on the first tick after landing, neither updates the friction estimate nor detects a collision", () => {
    const air = fc.array(driveInput, { minLength: 1, maxLength: 20 });
    const warm = fc.integer({ min: 20, max: 80 });
    fc.assert(
      fc.property(warm, air, mu, (w, a, m) => {
        const ins = [...repeat(FULL_THROTTLE, w), ...a, FULL_THROTTLE];
        const ter = ins.map((_, i) => ({
          onGround: i < w || i === ins.length - 1,
          step: false,
        }));
        const frames = simulate(ins, { mu: m }, 0, ter);
        const [before, landing] = frames.slice(-2);
        expect(landing?.state.friction).toBe(before?.state.friction);
        expect(landing?.blocked).toBe(false);
      }),
    );
  });

  it("on flat ground the friction estimate settles on the engine's friction whatever the heading (ADR 0003)", () => {
    const yaw0 = fc.double({ min: -180, max: 180, noNaN: true });
    fc.assert(
      fc.property(yaw0, mu, (y, m) => {
        const frames = simulate(repeat(FULL_THROTTLE, 60), { mu: m }, y);
        expect(frames.at(-1)?.state.friction).toBeCloseTo(m, 9);
      }),
    );
  });

  it("moves the friction estimate frictionEma of the way toward the measured ratio (ADR 0003)", () => {
    const given = { x: 0.5, z: 1 };
    const r = stepMotion(
      { speed: 0.5, yaw: 0, stepTicks: 0, friction: 0.7, expected: given },
      FULL_THROTTLE,
      { velocity: { x: given.x * 0.6, z: given.z * 0.6 }, onGround: true },
      () => 0,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(r.blocked).toBe(false);
    expect(r.state.friction).toBeCloseTo(
      (1 - MOTION.frictionEma) * 0.7 + MOTION.frictionEma * 0.6,
      12,
    );
  });

  it("the step countdown stays between 0 and stepTicks - 1", () => {
    fc.assert(
      fc.property(inputs, mu, terrain, (ins, m, ter) => {
        for (const fr of simulate(ins, { mu: m }, 0, ter)) {
          expect(fr.state.stepTicks).toBeGreaterThanOrEqual(0);
          expect(fr.state.stepTicks).toBeLessThan(MOTION.stepTicks);
        }
      }),
    );
  });

  it("never jumps a step without forward throttle, even while creeping or coasting forward (ADR 0018)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: SUV_SPEC.maxSpeed, noNaN: true }),
        fc.boolean(),
        (speed, creep) => {
          const r = stepMotion(
            { speed, yaw: 0, stepTicks: 0 },
            { throttle: 0, steer: 0, handbrake: false, creep },
            { velocity: { x: 0, z: 0 }, onGround: true },
            () => 2,
            SUV_MOTION,
            SUV_TYRES,
          );
          expect(r.jumpVelocity).toBe(0);
        },
      ),
    );
  });

  it("jumps a step when forward throttle brakes the vehicle out of reverse to a standstill", () => {
    const r = stepMotion(
      { speed: -SUV_SPEC.brake, yaw: 0, stepTicks: 0 },
      FULL_THROTTLE,
      { velocity: { x: 0, z: 0 }, onGround: true },
      () => 2,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(r.jumpVelocity).toBe(MOTION.stepVelocity);
    expect(r.state.speed).toBe(MOTION.stepMinSpeed);
  });

  it("in the air without a step jump, applies only airControl of the correction toward the target", () => {
    const vel = fc.record({
      x: fc.double({ min: -1, max: 1, noNaN: true }),
      z: fc.double({ min: -1, max: 1, noNaN: true }),
    });
    const prev = fc.record({
      speed: fc.double({
        min: -SUV_SPEC.maxReverse,
        max: SUV_SPEC.maxSpeed,
        noNaN: true,
      }),
      yaw: fc.double({ min: -180, max: 180, noNaN: true }),
      friction: fc.option(
        fc.double({ min: MOTION.frictionMin, max: 1, noNaN: true }),
        {
          nil: undefined,
        },
      ),
      expected: fc.option(vel, { nil: undefined }),
      stepTicks: fc.constant(0),
    });
    fc.assert(
      fc.property(prev, driveInput, vel, (p, input, v) => {
        const r = stepMotion(
          p,
          input,
          { velocity: v, onGround: false },
          () => 2,
          SUV_MOTION,
          SUV_TYRES,
        );
        expect(r.jumpVelocity).toBe(0);
        expect(r.blocked).toBe(false);
        expect(r.state.friction).toBe(p.friction);
        const f = r.forward;
        const vLong = dot(v, f);
        const keepLat =
          1 - (input.handbrake ? SUV_SPEC.handbrakeGrip : SUV_SPEC.grip);
        const target = clampLength(
          {
            x: f.x * r.state.speed + (v.x - f.x * vLong) * keepLat,
            z: f.z * r.state.speed + (v.z - f.z * vLong) * keepLat,
          },
          SUV_SPEC.maxSpeed,
        );
        expect(r.impulse.x).toBeCloseTo(
          MOTION.airControl * (target.x / MOTION.airFriction - v.x),
          9,
        );
        expect(r.impulse.z).toBeCloseTo(
          MOTION.airControl * (target.z / MOTION.airFriction - v.z),
          9,
        );
      }),
    );
  });

  it("jumps up a step only on the ground with forward throttle and non-negative speed", () => {
    const prev = fc.record({
      speed: fc.double({
        min: -SUV_SPEC.maxReverse,
        max: SUV_SPEC.maxSpeed,
        noNaN: true,
      }),
      yaw: fc.double({ min: -180, max: 180, noNaN: true }),
      stepTicks: fc.constant(0),
    });
    fc.assert(
      fc.property(prev, driveInput, fc.boolean(), (p, input, onGround) => {
        const r = stepMotion(
          p,
          input,
          { velocity: { x: 0, z: 0 }, onGround },
          () => 2,
          SUV_MOTION,
          SUV_TYRES,
        );
        const speed = updateSpeed(
          p.speed,
          input.throttle,
          input.creep,
          SUV_MOTION,
          SUV_TYRES.creepSpeed,
        );
        expect(r.jumpVelocity > 0).toBe(
          onGround && input.throttle > 0 && speed >= 0,
        );
      }),
    );
  });

  it("drops all sideways velocity while climbing a step", () => {
    const climb = fc.array(driveInput, {
      minLength: MOTION.stepTicks,
      maxLength: MOTION.stepTicks,
    });
    fc.assert(
      fc.property(forwardInputs, climb, mu, (warm, up, m) => {
        const jump = { ...FULL_THROTTLE, steer: 0 };
        const ter: Terrain[] = [
          ...warm.map(() => FLAT),
          { onGround: true, step: true },
          ...up.slice(1).map(() => ({ onGround: false, step: false })),
        ];
        const frames = simulate(
          [...warm, jump, ...up.slice(1)],
          { mu: m },
          0,
          ter,
        );
        const climbing = frames.slice(warm.length);
        expect(climbing[0]?.jumpVelocity).toBe(MOTION.stepVelocity);
        for (const fr of climbing)
          expect(lateral(fr.body.vel, fr.state.yaw)).toBeLessThan(1e-9);
      }),
    );
  });

  it("sideways velocity decreases without increasing after input stops", () => {
    const quiet = repeat(NEUTRAL_GROUND, 60);
    fc.assert(
      fc.property(inputs, mu, (warm, m) => {
        const frames = simulate([...warm, ...quiet], { mu: m });
        let previous = Number.POSITIVE_INFINITY;
        for (const fr of frames.slice(warm.length)) {
          const current = lateral(fr.body.vel, fr.state.yaw);
          expect(current).toBeLessThanOrEqual(previous + 1e-9);
          previous = current;
        }
      }),
    );
  });

  it("slides along a wall hit at an angle, keeping the impact along-wall speed (ADR 0081)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 85 }),
        fc
          .integer({ min: Math.round(MOTION.frictionMin * 100), max: 100 })
          .map((n) => n / 100),
        (theta, k) => {
          const frames = driveAtWall(theta, k);
          const first = frameAt(frames, 60);
          expect(first.along).toBeGreaterThan(0);
          for (let i = 61; i < 120; i++) {
            const fr = frameAt(frames, i);
            expect(fr.blocked).toBe(true);
            expect(Math.abs(fr.along - first.along)).toBeLessThanOrEqual(1e-6);
            expect(fr.friction).toBe(first.friction);
            expect(fr.speed).toBeGreaterThan(0);
          }
          let flips = 0;
          for (let i = 1; i < frames.length; i++)
            if (frameAt(frames, i).blocked !== frameAt(frames, i - 1).blocked)
              flips++;
          expect(flips).toBe(1);
        },
      ),
    );
  });

  it("stops at a wall hit nearly head-on, as before (ADR 0081)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 50, max: 100 }).map((n) => n / 100),
        (theta, k) => {
          const last = frameAt(driveAtWall(theta, k), 119);
          expect(last.speed).toBeGreaterThanOrEqual(0);
          expect(last.speed).toBeLessThanOrEqual(0.05);
          expect(Math.abs(last.along)).toBeLessThan(0.05);
        },
      ),
    );
  });

  it("a blocked tick carries no sideways velocity (ADR 0081)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -180, max: 180 }),
        fc.integer({ min: 1, max: 90 }).map((n) => n / 100),
        fc.double({ min: -0.5, max: 0.5, noNaN: true }),
        (yaw, speed, side) => {
          const f = forward(yaw);
          const v = { x: -f.z * side, z: f.x * side };
          const r = stepMotion(
            {
              ...initialMotion(yaw),
              speed,
              friction: 0.69,
              expected: { x: f.x * 2, z: f.z * 2 },
            },
            NEUTRAL_GROUND,
            { velocity: v, onGround: true },
            () => 0,
            SUV_MOTION,
            SUV_TYRES,
          );
          expect(r.blocked).toBe(true);
          const after = {
            x: (v.x + r.impulse.x) * 0.69,
            z: (v.z + r.impulse.z) * 0.69,
          };
          const sideways = { x: -r.forward.z, z: r.forward.x };
          expect(Math.abs(dot(after, sideways))).toBeLessThan(1e-9);
        },
      ),
    );
  });

  it("slides sideways more under the handbrake than during normal driving", () => {
    const run = (hb: boolean) => {
      const accel = repeat(FULL_THROTTLE, 60);
      const turn = repeat(
        { throttle: 1, steer: 1, handbrake: hb, creep: false },
        20,
      );
      const frames = simulate([...accel, ...turn], { mu: 0.688 });
      return Math.max(
        ...frames.slice(60).map((f) => lateral(f.body.vel, f.state.yaw)),
      );
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it("reports an upward jump when jumping up a step and raises internal speed to the minimum", () => {
    const r = stepMotion(
      initialMotion(0),
      FULL_THROTTLE,
      { velocity: { x: 0, z: 0 }, onGround: true },
      () => 2,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(r.jumpVelocity).toBe(MOTION.stepVelocity);
    expect(r.state.speed).toBeGreaterThanOrEqual(MOTION.stepMinSpeed);
    expect(r.state.stepTicks).toBe(MOTION.stepTicks - 1);
  });

  it("jumps a one-block step with the lower velocity (ADR 0035)", () => {
    const r = stepMotion(
      initialMotion(0),
      FULL_THROTTLE,
      { velocity: { x: 0, z: 0 }, onGround: true },
      () => 1,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(r.jumpVelocity).toBe(MOTION.oneStepVelocity);
    expect(r.state.speed).toBeGreaterThanOrEqual(MOTION.stepMinSpeed);
  });

  it("keeps the key set of the returned state (absent friction stays absent)", () => {
    const noStep = () => 0 as const;
    const keys = (state: MotionState) => Object.keys(state).sort();

    // Ground, no previous expected velocity: the estimate does not run.
    const fresh = stepMotion(
      initialMotion(0),
      NEUTRAL_GROUND,
      { velocity: { x: 0, z: 0 }, onGround: true },
      noStep,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(keys(fresh.state)).toEqual([
      "expected",
      "mediumExpected",
      "speed",
      "stepTicks",
      "yaw",
    ]);

    // Ground, 70% of the previous expected velocity kept: the estimate runs.
    const estimated = stepMotion(
      { ...initialMotion(0), expected: { x: 0, z: 0.5 } },
      NEUTRAL_GROUND,
      { velocity: { x: 0, z: 0.35 }, onGround: true },
      noStep,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(keys(estimated.state)).toEqual([
      "expected",
      "friction",
      "mediumExpected",
      "speed",
      "stepTicks",
      "yaw",
    ]);
    expect(estimated.state.friction).toBeCloseTo(0.7, 12);

    // In the air: the previous estimate is kept and expected is cleared.
    const airborne = stepMotion(
      { ...initialMotion(0), friction: 0.9, expected: { x: 0, z: 0.5 } },
      NEUTRAL_GROUND,
      { velocity: { x: 0, z: 0.4 }, onGround: false },
      noStep,
      SUV_MOTION,
      SUV_TYRES,
    );
    expect(keys(airborne.state)).toEqual([
      "expected",
      "friction",
      "mediumExpected",
      "speed",
      "stepTicks",
      "yaw",
    ]);
    expect(airborne.state.friction).toBe(0.9);
    expect(airborne.state.expected).toBeUndefined();
  });
});

describe("ground walls and slow surfaces (ADR 0082)", () => {
  const axis = fc.double({ min: -2, max: 2, noNaN: true });
  const givenVel = fc.record({ x: axis, z: axis });
  const keptRatio = fc.double({
    min: MOTION.frictionMin * MOTION.blockedRatio,
    max: MOTION.frictionMax * MOTION.blockedRatio,
    noNaN: true,
  });
  // Strictly above blockedAxisMin, either sign.
  const drivenAxis = fc
    .tuple(
      fc.double({ min: 0.05, max: 2, noNaN: true }),
      fc.constantFrom(1, -1),
    )
    .map(([m, s]) => m * s);
  // At most blockedAxisMin, either sign.
  const undrivenAxis = fc.double({
    min: -MOTION.blockedAxisMin,
    max: MOTION.blockedAxisMin,
    noNaN: true,
  });
  const surface = fc.integer({ min: 20, max: 100 }).map((n) => n / 100);

  it("learns any uniform surface from 0.2 to 1 and reaches 90% of max speed", () => {
    fc.assert(
      fc.property(
        surface,
        fc.double({ min: -180, max: 180, noNaN: true }),
        (k, yaw) => {
          const frames = simulate(repeat(FULL_THROTTLE, 200), { mu: k }, yaw);
          const friction = defined(
            defined(frames[59], "tick 60").state.friction,
            "friction at tick 60",
          );
          expect(Math.abs(friction - k)).toBeLessThanOrEqual(0.01);
          expect(
            length(defined(frames[199], "tick 200").body.vel),
          ).toBeGreaterThanOrEqual(0.9 * SUV_SPEC.maxSpeed - 1e-9);
          expect(frames.every((f) => !f.blocked)).toBe(true);
        },
      ),
    );
  });

  it("a head-on wall is still a wall and freezes the friction estimate on any surface", () => {
    fc.assert(
      fc.property(
        surface,
        fc.double({ min: 8, max: 20, noNaN: true }),
        fc.double({ min: -92, max: -88, noNaN: true }),
        (k, wallX, yaw) => {
          const frames = simulate(
            repeat(FULL_THROTTLE, 200),
            { mu: k, wallX },
            yaw,
          );
          const first = frames.findIndex((f) => f.touching);
          expect(first).toBeGreaterThan(0);
          expect(first).toBeLessThan(198);
          expect(defined(frames[first + 1], "tick after contact").blocked).toBe(
            true,
          );
          const frozen = defined(frames[first], "contact tick").state.friction;
          for (let i = first + 1; i < frames.length; i++)
            expect(defined(frames[i], `tick ${i}`).state.friction).toBe(frozen);
          expect(
            Math.abs(defined(frames[199], "tick 200").body.vel.x),
          ).toBeLessThan(1e-6);
        },
      ),
    );
  });

  it("groundWallAxes: a uniform ratio of at least wallKeptMax on every axis is never a wall", () => {
    fc.assert(
      fc.property(
        givenVel,
        fc.double({ min: MOTION.wallKeptMax, max: 1, noNaN: true }),
        keptRatio,
        (given, k, ratio) => {
          // (given.x * k) / given.x can land one ulp below wallKeptMax. At
          // keptRatio the ulp gap between axes is a tie, not a wall (#340).
          fc.pre(k >= MOTION.wallKeptMax + 1e-9);
          expect(
            groundWallAxes({ x: given.x * k, z: given.z * k }, given, ratio),
          ).toEqual({ x: false, z: false });
        },
      ),
    );
  });

  it("groundWallAxes: a zeroed driven axis is a wall", () => {
    fc.assert(
      fc.property(
        givenVel,
        keptRatio,
        fc.double({ min: -1, max: 1, noNaN: true }),
        (given, ratio, otherKept) => {
          expect(
            groundWallAxes({ x: 0, z: given.z * otherKept }, given, ratio).x,
          ).toBe(Math.abs(given.x) > MOTION.blockedAxisMin);
          expect(
            groundWallAxes({ x: given.x * otherKept, z: 0 }, given, ratio).z,
          ).toBe(Math.abs(given.z) > MOTION.blockedAxisMin);
        },
      ),
    );
  });

  it("groundWallAxes: an undriven axis is never a wall", () => {
    fc.assert(
      fc.property(
        givenVel,
        axis,
        undrivenAxis,
        keptRatio,
        (v, other, small, ratio) => {
          expect(groundWallAxes(v, { x: small, z: other }, ratio).x).toBe(
            false,
          );
          expect(groundWallAxes(v, { x: other, z: small }, ratio).z).toBe(
            false,
          );
        },
      ),
    );
  });

  it("groundWallAxes: driven axes that disagree across keptRatio mark the lower one", () => {
    fc.assert(
      fc.property(
        drivenAxis,
        drivenAxis,
        fc.integer({ min: 15, max: 49 }),
        fc.integer({ min: 16, max: 50 }),
        fc.integer({ min: 17, max: 100 }),
        fc.boolean(),
        (gx, gz, lowPct, keptPct, highPct, lowOnX) => {
          fc.pre(lowPct < keptPct && highPct > keptPct);
          const low = lowPct / 100;
          const high = highPct / 100;
          const given = { x: gx, z: gz };
          const v = lowOnX
            ? { x: gx * low, z: gz * high }
            : { x: gx * high, z: gz * low };
          expect(groundWallAxes(v, given, keptPct / 100)).toEqual({
            x: lowOnX,
            z: !lowOnX,
          });
        },
      ),
    );
  });

  it("groundWallAxes examples: disagreeing axes, a uniform slow surface, and one driven axis", () => {
    expect(groundWallAxes({ x: 0.2, z: 0.69 }, { x: 1, z: 1 }, 0.345)).toEqual({
      x: true,
      z: false,
    });
    expect(groundWallAxes({ x: 0.2, z: 0.3 }, { x: 1, z: 1 }, 0.345)).toEqual({
      x: false,
      z: false,
    });
    // One driven axis keeping 0.3 is a friction sample, where 0003 read a wall.
    expect(groundWallAxes({ x: 0.3, z: 0 }, { x: 1, z: 0 }, 0.345)).toEqual({
      x: false,
      z: false,
    });
    // z at exactly blockedAxisMin is not driven.
    expect(
      groundWallAxes({ x: 0.3, z: 0.02 }, { x: 1, z: 0.03 }, 0.345),
    ).toEqual({ x: false, z: false });
    expect(groundWallAxes({ x: 0.1, z: 0 }, { x: 1, z: 0 }, 0.345)).toEqual({
      x: true,
      z: false,
    });
    // Pushed back on x.
    expect(groundWallAxes({ x: -0.05, z: 0.3 }, { x: 1, z: 1 }, 0.345)).toEqual(
      { x: true, z: false },
    );
    // Axes one ulp apart across keptRatio agree: a surface, not a wall (#340).
    expect(
      groundWallAxes(
        { x: 0.21000000000000002, z: 0.21 },
        { x: 1, z: 1 },
        0.21000000000000002,
      ),
    ).toEqual({ x: false, z: false });
    expect(groundWallAxes({ x: 0.3, z: 0.1 }, { x: 1, z: 1 }, 0.2)).toEqual({
      x: false,
      z: true,
    });
  });

  // Drives 200 ticks on k1, then 25 on k2.
  const changeSurface = (k1: number, k2: number, yaw: number) => {
    let state = initialMotion(yaw);
    let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
    for (let i = 0; i < 225; i++) {
      const r = stepMotion(
        state,
        FULL_THROTTLE,
        { velocity: body.vel, onGround: true },
        () => 0,
        SUV_MOTION,
        SUV_TYRES,
      );
      state = r.state;
      body = engineStep(body, r.impulse, { mu: i < 200 ? k1 : k2 }, true).body;
      expect(r.blocked).toBe(false);
      expect(length(body.vel)).toBeLessThanOrEqual(
        SUV_SPEC.maxSpeed / MOTION.frictionMin + 1e-9,
      );
    }
    expect(length(body.vel)).toBeLessThanOrEqual(SUV_SPEC.maxSpeed * 1.01);
  };

  it("changing to another surface is never a wall, stays below maxSpeed / frictionMin, and settles within 25 ticks", () => {
    fc.assert(
      fc.property(
        surface,
        surface,
        fc.integer({ min: -180, max: 180 }),
        changeSurface,
      ),
    );
  });

  it("a surface that keeps exactly blockedRatio of the estimate is never a wall", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 50 }).map((n) => n / 100),
        fc.integer({ min: -180, max: 180 }),
        (k2, yaw) => changeSurface(2 * k2, k2, yaw),
      ),
    );
  });

  it("changing surface examples: ties at keptRatio found by fast-check (#340)", () => {
    // k2 is exactly half the estimate on the first tick on it.
    changeSurface(0.42, 0.21, -1);
    // The estimate reaches 2 * k2 one tick after the change.
    changeSurface(0.9, 0.4, 45);
  });
});

describe("blockedAxes / speedAfterWall (ADR 0003, 0081)", () => {
  const component = fc.double({ min: -2, max: 2, noNaN: true });
  const vec = fc.record({ x: component, z: component });

  it("blockedAxes checks each axis on its own and hitWall is either axis", () => {
    fc.assert(
      fc.property(
        vec,
        vec,
        fc.double({ min: 0.25, max: 0.5, noNaN: true }),
        component,
        (v, given, ratio, otherZ) => {
          const a = blockedAxes(v, given, ratio);
          expect(hitWall(v, given, ratio)).toBe(a.x || a.z);
          expect(blockedAxes({ x: v.x, z: otherZ }, given, ratio).x).toBe(a.x);
        },
      ),
    );
  });

  it("speedAfterWall never raises the speed and never changes its sign", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        vec,
        fc.integer({ min: -180, max: 180 }),
        fc.record({ x: fc.boolean(), z: fc.boolean() }),
        (speed, v, yaw, axes) => {
          const out = speedAfterWall(speed, v, forward(yaw), axes);
          expect(Math.abs(out)).toBeLessThanOrEqual(Math.abs(speed));
          expect(out * speed).toBeGreaterThanOrEqual(0);
          if (speed === 0) expect(out).toBe(0);
        },
      ),
    );
  });

  it("speedAfterWall keeps the speed whose free-axis component matches the along-wall velocity", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 85 }),
        fc.constantFrom(1, -1),
        fc.integer({ min: 1, max: 90 }).map((n) => n / 100),
        fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
        fc.boolean(),
        (theta, sign, speed, along, wallOnX) => {
          const f = wallOnX ? forward(-90 + theta) : forward(-theta);
          const v = wallOnX
            ? { x: 0, z: f.z * along * sign }
            : { x: f.x * along * sign, z: 0 };
          const axes = { x: wallOnX, z: !wallOnX };
          expect(speedAfterWall(sign * speed, v, f, axes)).toBeCloseTo(
            sign * Math.min(speed, along),
            12,
          );
        },
      ),
    );
  });

  it("speedAfterWall falls back to the forward speed when both axes are blocked, nearly head-on, or moving backward along the wall", () => {
    const diagonal = forward(-45);
    const both = { x: 0.1, z: 0.1 };
    expect(
      speedAfterWall(0.9, both, diagonal, { x: true, z: true }),
    ).toBeCloseTo(Math.max(0, dot(both, diagonal)), 12);
    const headOn = forward(-90 + 1);
    const along = { x: 0, z: 0.5 };
    expect(
      speedAfterWall(0.9, along, headOn, { x: true, z: false }),
    ).toBeCloseTo(Math.max(0, dot(along, headOn)), 12);
    expect(
      speedAfterWall(0.9, { x: 0, z: -0.3 }, diagonal, { x: true, z: false }),
    ).toBe(0);
    expect(
      speedAfterWall(-0.2, { x: 0, z: -0.1 }, diagonal, { x: true, z: false }),
    ).toBeCloseTo(-Math.min(0.2, 0.1 / diagonal.z), 12);
  });
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

const anyAxis = fc.oneof(
  fc.double({ min: -1.5, max: 1.5, noNaN: true }),
  fc.double(),
);
const anyRaw: fc.Arbitrary<RawInput> = fc.record({
  moveX: anyAxis,
  moveY: anyAxis,
  jump: fc.boolean(),
});
const anyRawOrNone = fc.option(anyRaw, { nil: undefined });

const anyYaw = fc.double({ min: -180, max: 180, noNaN: true });

const legacyLimits = (s: typeof SUV_SPEC | typeof CAMPER_SPEC) => ({
  maxSpeed: s.maxSpeed,
  maxReverse: s.maxReverse,
  accel: s.accel,
  reverseAccel: s.reverseAccel,
  brake: s.brake,
  drag: s.drag,
  turnRate: s.turnRate,
  steerFullSpeed: s.steerFullSpeed,
  grip: s.grip,
  handbrakeGrip: s.handbrakeGrip,
  creepSpeed: s.creepSpeed,
});

const TRANSFORMING_KINDS = [
  {
    kind: "suv",
    limits: SUV_MOTION,
    tyres: SUV_TYRES,
    legacy: legacyLimits(SUV_SPEC),
  },
  {
    kind: "camper",
    limits: CAMPER_MOTION,
    tyres: CAMPER_TYRES,
    legacy: legacyLimits(CAMPER_SPEC),
  },
] as const;

describe("per-kind control mapping, transforming kinds (ADR 0089)", () => {
  it("maps the stick for a transforming kind as the old drive input did, in every form", () => {
    fc.assert(
      fc.property(anyRawOrNone, fc.constantFrom(...FORMS), (raw, form) => {
        expect(groundInputFor(raw, form)).toStrictEqual(
          legacyDriveInputFor(raw, form),
        );
      }),
      { numRuns: 100 },
    );
  });

  it.each(TRANSFORMING_KINDS)(
    "moves the $kind tick by tick as the old mapping did",
    ({ limits, tyres, legacy }) => {
      fc.assert(
        fc.property(
          anyYaw,
          fc.constantFrom(...FORMS),
          fc.record({
            drag: fc.double({ min: 0.5, max: 1, noNaN: true }),
            maxSpeed: fc.double({ min: 0.2, max: 2, noNaN: true }),
          }),
          fc.array(
            fc.record({
              raw: anyRawOrNone,
              velocity: fc.record({
                x: fc.double({ min: -2, max: 2, noNaN: true }),
                z: fc.double({ min: -2, max: 2, noNaN: true }),
              }),
              onGround: fc.boolean(),
            }),
            { minLength: 1, maxLength: 60 },
          ),
          (heading, form, medium, ticks) => {
            let next = initialMotion(heading);
            let old = initialMotion(heading);
            for (const { raw, velocity, onGround } of ticks) {
              const result =
                form === "car"
                  ? stepMotion(
                      next,
                      groundInputFor(raw, form),
                      { velocity, onGround },
                      () => 0,
                      limits,
                      tyres,
                    )
                  : stepMediumMotion(
                      next,
                      groundInputFor(raw, form),
                      velocity,
                      medium,
                      limits,
                      tyres.creepSpeed,
                    );
              const oracle =
                form === "car"
                  ? stepMotion(
                      old,
                      legacyDriveInputFor(raw, form),
                      { velocity, onGround },
                      () => 0,
                      legacy,
                      legacy,
                    )
                  : stepMediumMotion(
                      old,
                      legacyDriveInputFor(raw, form),
                      velocity,
                      medium,
                      legacy,
                      legacy.creepSpeed,
                    );
              expect(result.state.speed).toBe(oracle.state.speed);
              expect(result.state.yaw).toBe(oracle.state.yaw);
              expect(result.impulse.x).toBe(oracle.impulse.x);
              expect(result.impulse.z).toBe(oracle.impulse.z);
              expect(result.blocked).toBe(oracle.blocked);
              next = result.state;
              old = oracle.state;
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
