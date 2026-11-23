import { expect, it } from "vitest";
import {
  SCOOTER_SPEC,
  SCOOTER_TRANSFORMING,
  SCOOTER_WATER,
} from "../../../../../src/domain/vehicle/kinds/scooter/spec";

it("keeps the medium speed limits aligned and fits the probes and body inside their envelopes", () => {
  expect(SCOOTER_TRANSFORMING.stepLaneOffset).toBeGreaterThan(0);
  expect(SCOOTER_TRANSFORMING.stepLaneOffset).toBeLessThan(
    SCOOTER_SPEC.bodyHalfWidth,
  );
  expect(SCOOTER_WATER.maxSpeed).toBe(SCOOTER_SPEC.maxSpeed);
  expect(SCOOTER_SPEC.footprint).toBeGreaterThanOrEqual(
    Math.hypot(SCOOTER_SPEC.bodyFront, SCOOTER_SPEC.bodyHalfWidth),
  );
});
