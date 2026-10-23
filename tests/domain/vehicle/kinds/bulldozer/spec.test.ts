import { expect, it } from "vitest";
import {
  BULLDOZER_AIR,
  BULLDOZER_WATER,
  BULLDOZER_SPEC as S,
  BULLDOZER_TRANSFORMING as T,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";
import {
  SUV_SPEC,
  SUV_TRANSFORMING,
} from "../../../../../src/domain/vehicle/kinds/suv/spec";
import { MOTION } from "../../../../../src/domain/vehicle/motion/constants";

it("halves the SUV's driving numbers and keeps the spike's pivot (ADR 0136)", () => {
  expect(S).toMatchObject({
    maxSpeed: SUV_SPEC.maxSpeed / 2,
    accel: SUV_SPEC.accel / 2,
    brake: 0.02,
    drag: 0.01,
    maxReverse: 0.1,
    reverseAccel: 0.005625,
    turnRate: 3,
    pivotStick: 0.35,
    grip: 1,
    steerFullSpeed: 0.08,
  });
});
it("copies the SUV's flight and water values, with its own body", () => {
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
  expect(T).toMatchObject({
    carHeight: 2.9,
    hitboxFront: 1.2,
    maxBank: 0,
    floatDraft: 2.5,
    gearProbeOffset: 1,
  });
  expect(BULLDOZER_AIR).toEqual({ drag: 0.91, maxSpeed: 0.45 });
  expect(BULLDOZER_WATER).toEqual({ drag: 0.83, maxSpeed: 0.5 });
});
it("cuts the blade's strip and tunnels as high as the body (ADR 0137)", () => {
  expect(S.blade).toEqual({
    near: 1,
    far: 2.9,
    halfWidth: 2.32,
    bodyHeight: 2.9,
    minSpeed: 0.02,
  });
  expect(S.blade.bodyHeight).toBe(S.carHeight);
  expect(S.blade.halfWidth).toBe(S.bodyHalfWidth);
  expect(S.blade.far).toBeGreaterThan(S.bodyFront);
});
it("lights five beams, dimmer near the cab", () => {
  expect(S.headlightReach).toEqual([6, 10, 15, 21, 27]);
  expect(S.headlightLevels).toEqual([8, 12, 15, 15, 15]);
  expect(Object.isFrozen(S.headlightReach)).toBe(true);
  expect(Object.isFrozen(S.headlightLevels)).toBe(true);
});
it("sizes the tracks and the door from the model", () => {
  expect(S.tracks).toEqual({
    halfGauge: 14.3 / 16,
    phaseStep: 1.5 / 16 / 3,
    radius: 6.7 / 16,
  });
  expect(S).toMatchObject({
    doorOpenTicks: 40,
    doorSteps: 10,
    bodyFront: 2.4,
    bodyHalfWidth: 2.32,
    footprint: 3.35,
    hopVelocity: MOTION.oneStepVelocity,
    hopTicks: MOTION.stepTicks,
  });
});
