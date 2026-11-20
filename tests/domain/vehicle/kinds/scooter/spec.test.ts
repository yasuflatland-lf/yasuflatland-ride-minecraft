import { expect, it } from "vitest";
import {
  SCOOTER_AIR,
  SCOOTER_SPEC,
  SCOOTER_TRANSFORMING,
  SCOOTER_WATER,
} from "../../../../../src/domain/vehicle/kinds/scooter/spec";

it("uses ground speed on the surface with probes inside its narrow body", () => {
  expect(SCOOTER_SPEC.maxSpeed).toBe(0.9);
  expect(SCOOTER_TRANSFORMING.waterPolicy).toBe("surface");
  expect(SCOOTER_TRANSFORMING.stepLaneOffset).toBeGreaterThan(0);
  expect(SCOOTER_TRANSFORMING.stepLaneOffset).toBeLessThan(
    SCOOTER_SPEC.bodyHalfWidth,
  );
  expect(SCOOTER_AIR.maxSpeed).toBe(SCOOTER_SPEC.maxSpeed);
  expect(SCOOTER_WATER.maxSpeed).toBe(SCOOTER_SPEC.maxSpeed);
  expect(SCOOTER_SPEC.footprint).toBeGreaterThanOrEqual(
    Math.hypot(SCOOTER_SPEC.bodyFront, SCOOTER_SPEC.bodyHalfWidth),
  );
});
