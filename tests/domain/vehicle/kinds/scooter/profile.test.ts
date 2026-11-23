import { expect, it } from "vitest";
import { SCOOTER_PROFILE } from "../../../../../src/domain/vehicle/kinds/scooter/profile";
import { SCOOTER_SPEC } from "../../../../../src/domain/vehicle/kinds/scooter/spec";

it("places the passenger behind the driver and fits the hitbox within placement clearance", () => {
  expect(SCOOTER_PROFILE.seats.positions[1]?.z).toBeLessThan(
    SCOOTER_PROFILE.seats.positions[0]?.z ?? 0,
  );
  const clearance = SCOOTER_PROFILE.placement.clearance;
  expect(clearance.height).toBeGreaterThanOrEqual(SCOOTER_PROFILE.body.height);
  expect(clearance.halfX * 2 + 1).toBeGreaterThanOrEqual(
    SCOOTER_SPEC.hitboxFront * 2,
  );
  expect(clearance.halfZ * 2 + 1).toBeGreaterThanOrEqual(
    SCOOTER_SPEC.hitboxFront * 2,
  );
});
