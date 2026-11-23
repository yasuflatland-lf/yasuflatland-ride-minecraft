import { expect, it } from "vitest";
import {
  BULLDOZER_SPEC as S,
  BULLDOZER_TRANSFORMING as T,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";
import {
  SUV_SPEC,
  SUV_TRANSFORMING,
} from "../../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../../src/domain/vehicle/motion/constants";

it("halves the SUV's top speed and acceleration (ADR 0136)", () => {
  expect(S).toMatchObject({
    maxSpeed: SUV_SPEC.maxSpeed / 2,
    accel: SUV_SPEC.accel / 2,
  });
});
it("shares flight and water tuning with the SUV and keeps constant bank easing", () => {
  for (const k of ["flightDrag", "maxWaterSpeed", "waterDrag"] as const)
    expect(S[k]).toBe(SUV_SPEC[k]);
  for (const k of [
    "doubleTapTicks",
    "takeoffTicks",
    "takeoffClimb",
    "landingSink",
    "maxClimb",
    "flightVerticalDrag",
    "waterVerticalDrag",
    "floatGain",
    "surfaceRise",
    "submarineStepProbeDrop",
    "gearDownHeight",
    "bankRate",
    "bankSink",
  ] as const)
    expect(T[k]).toBe(SUV_TRANSFORMING[k]);
  expect(T.bankEasing).toBe("constant");
});
it("cuts the blade's strip and tunnels as high as the body (ADR 0137)", () => {
  expect(S.blade.bodyHeight).toBe(S.carHeight);
  expect(S.blade.halfWidth).toBe(S.bodyHalfWidth);
  expect(S.blade.far).toBeGreaterThan(S.bodyFront);
});
it("uses the shared step hop", () => {
  expect(S).toMatchObject({
    hopVelocity: MOTION.oneStepVelocity,
    hopTicks: MOTION.stepTicks,
  });
});

it("pins the paver constraints its comments state (ADR 0181)", () => {
  expect(S.paver.trail).toBeGreaterThan(S.maxSpeed);
  expect(S.paver.flightGap).toBeGreaterThanOrEqual(Math.SQRT2);
  expect(S.paver.bodyHalf).toBeGreaterThanOrEqual(1.2 * Math.SQRT2);
});
