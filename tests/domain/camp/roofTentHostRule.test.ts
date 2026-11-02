import fc from "fast-check";
import { expect, it } from "vitest";
import { hostVerdict } from "../../../src/domain/camp/roofTent/hostRule";
import { DUTCH_OVEN_SPEC, ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";

it("keeps unknown hosts and otherwise removes exactly removed, driven, or moving hosts", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        "present" as const,
        "unknown" as const,
        "removed" as const,
      ),
      fc.boolean(),
      fc.boolean(),
      (presence, driverPresent, moving) => {
        expect(hostVerdict({ presence, driverPresent, moving })).toBe(
          presence === "unknown" ||
            (presence === "present" && !driverPresent && !moving)
            ? "keep"
            : "remove",
        );
      },
    ),
  );
});

it("freezes recovery tuning and checks departure faster than tabletop gear", () => {
  expect(Object.isFrozen(ROOF_TENT_SPEC)).toBe(true);
  expect(ROOF_TENT_SPEC.hitsToFoldUp).toBe(3);
  expect(ROOF_TENT_SPEC.hitResetTicks).toBe(100);
  expect(ROOF_TENT_SPEC.hostCheckTicks).toBe(4);
  expect(ROOF_TENT_SPEC.hostCheckTicks).toBeLessThan(
    DUTCH_OVEN_SPEC.hostCheckTicks,
  );
  expect(ROOF_TENT_SPEC.interactReach).toBeGreaterThan(0);
});
