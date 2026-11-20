import { describe, expect, it } from "vitest";
import { SUV_SPEC } from "../../../../../src/domain/vehicle/kinds/suv/spec";
import { SPEC } from "../../../../../src/domain/vehicle/spec";

describe("SUV_SPEC", () => {
  it("keeps submarine buoyancy and speed within vehicle limits", () => {
    expect(SUV_SPEC.floatDraft).toBeLessThan(SUV_SPEC.carHeight);
    expect(SUV_SPEC.surfaceRise).toBeGreaterThan(0);
    expect(SUV_SPEC.surfaceRise).toBeLessThanOrEqual(SUV_SPEC.maxClimb);
    expect(SUV_SPEC.maxWaterSpeed).toBeLessThanOrEqual(SUV_SPEC.maxSpeed);
  });

  it("collision detection depth exceeds the maximum distance traveled in 1 tick (no passing through targets)", () => {
    expect(SUV_SPEC.bodyFront + SPEC.targetHalfWidth).toBeGreaterThan(
      SUV_SPEC.maxSpeed,
    );
  });

  it("climbs 1.5 blocks during takeoff (ADR 0021)", () => {
    expect(SUV_SPEC.takeoffTicks * SUV_SPEC.takeoffClimb).toBeCloseTo(1.5);
  });
});
