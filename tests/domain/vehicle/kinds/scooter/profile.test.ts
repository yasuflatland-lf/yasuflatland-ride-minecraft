import { expect, it } from "vitest";
import {
  SCOOTER_PROFILE,
  SCOOTER_TYRES,
} from "../../../../../src/domain/vehicle/kinds/scooter/profile";
import { SCOOTER_SPEC } from "../../../../../src/domain/vehicle/kinds/scooter/spec";

it("matches the frozen spike's body and driver-first tandem seats", () => {
  expect(SCOOTER_PROFILE.kind).toBe("scooter");
  expect(SCOOTER_PROFILE.body).toEqual({
    front: SCOOTER_SPEC.bodyFront,
    halfWidth: SCOOTER_SPEC.bodyHalfWidth,
    height: SCOOTER_SPEC.carHeight,
  });
  expect(SCOOTER_PROFILE.seats.positions).toEqual([
    { x: 0, z: -3.5 / 16 },
    { x: 0, z: -9.5 / 16 },
  ]);
  expect(SCOOTER_PROFILE.seats.positions[1]?.z).toBeLessThan(
    SCOOTER_PROFILE.seats.positions[0]?.z ?? 0,
  );
  expect(SCOOTER_PROFILE.boarding.order).toBe("engine");
  expect(SCOOTER_PROFILE.paintPolicy).toEqual({
    kind: "dyeable",
    defaultPaint: "white",
  });
  expect(SCOOTER_TYRES.creepSpeed).toBe(SCOOTER_SPEC.creepSpeed);
  const clearance = SCOOTER_PROFILE.placement.clearance;
  expect(clearance.height).toBeGreaterThanOrEqual(SCOOTER_PROFILE.body.height);
  expect(clearance.halfX * 2 + 1).toBeGreaterThanOrEqual(
    SCOOTER_SPEC.hitboxFront * 2,
  );
  expect(clearance.halfZ * 2 + 1).toBeGreaterThanOrEqual(
    SCOOTER_SPEC.hitboxFront * 2,
  );
});
