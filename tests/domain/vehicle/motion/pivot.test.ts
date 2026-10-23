import fc from "fast-check";
import { expect, it } from "vitest";
import { normalizeYaw } from "../../../../src/domain/shared/vec";
import { initialMotion } from "../../../../src/domain/vehicle/motion/motion";
import {
  pivotGroundStep,
  pivotMediumStep,
  pivotSpeed,
} from "../../../../src/domain/vehicle/motion/pivot";
import { type Body, engineStep } from "../../../support/engineModel";

const LIMITS = {
  maxSpeed: 0.45,
  maxReverse: 0.1,
  accel: 0.01125,
  reverseAccel: 0.005625,
  brake: 0.02,
  drag: 0.01,
  turnRate: 3,
  steerFullSpeed: 0.08,
  grip: 1,
};
const tyres = { handbrakeGrip: 1, creepSpeed: 0 };
const n = (min: number, max: number) => fc.double({ min, max, noNaN: true });
it("turns by -steer * turnRate per tick at any speed, standing included", () =>
  fc.assert(
    fc.property(n(-180, 180), n(-0.1, 0.45), n(-1, 1), (yaw, speed, steer) => {
      const state = { ...initialMotion(yaw), speed };
      const a = pivotGroundStep(
        state,
        steer,
        { velocity: { x: 0, z: 0 }, onGround: true },
        () => 0,
        LIMITS,
        tyres,
      );
      const b = pivotMediumStep(
        state,
        steer,
        { x: 0, z: 0 },
        { drag: 0.91, maxSpeed: 0.45 },
        LIMITS,
      );
      for (const s of [a, b])
        expect(normalizeYaw(s.state.yaw - yaw)).toBeCloseTo(-steer * 3, 9);
    }),
  ));
it("brakes toward zero by brake and never crosses it", () =>
  fc.assert(
    fc.property(n(-10, 10), n(0, 1), (s, b) => {
      expect(Math.abs(pivotSpeed(s, b))).toBe(Math.max(0, Math.abs(s) - b));
      expect(pivotSpeed(s, b) * s).toBeGreaterThanOrEqual(0);
    }),
  ));
it("stops from top speed without reversing over a held pivot", () => {
  let state = { ...initialMotion(0), speed: 0.45 };
  let body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0.45 * 0.69 } };
  let distance = 0;
  for (let tick = 0; tick < 40; tick++) {
    const out = pivotGroundStep(
      state,
      1,
      { velocity: body.vel, onGround: true },
      () => 0,
      LIMITS,
      tyres,
    );
    const next = engineStep(body, out.impulse, { mu: 0.69 }).body;
    distance += Math.hypot(next.pos.x - body.pos.x, next.pos.z - body.pos.z);
    body = next;
    state = out.state;
    expect(state.speed).toBeGreaterThanOrEqual(0);
    if (tick >= 22) expect(state.speed).toBe(0);
  }
  expect(distance).toBeLessThan(2.5);
});
it("keeps the wall rule of the step it wraps", () => {
  const out = pivotGroundStep(
    { ...initialMotion(-90), speed: 0.45, expected: { x: 0.3, z: 0 } },
    1,
    { velocity: { x: 0, z: 0 }, onGround: true },
    () => 0,
    LIMITS,
    tyres,
  );
  expect(out.blocked).toBe(true);
});
