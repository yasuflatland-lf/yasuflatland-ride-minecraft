import type { RoofTentSeatVariant } from "../../src/domain/camp/roofTent/seat";
import { ROOF_TENT_SPEC } from "../../src/domain/camp/spec";

const SHELL_RIDGE: Record<RoofTentSeatVariant, number> = {
  ladder: ROOF_TENT_SPEC.shellRidge,
  ground: ROOF_TENT_SPEC.groundShellRidge,
};

/**
 * Eye height above the tent origin: the same clearance below the variant's own ridge.
 * This is the single definition of the seated eye height; `rideSeatY` derives the pack seat offset from it.
 */
export function seatedEyeHeight(variant: RoofTentSeatVariant): number {
  return SHELL_RIDGE[variant] - ROOF_TENT_SPEC.eyeBelowRidge;
}

export function rideSeatY(variant: RoofTentSeatVariant = "ladder"): number {
  return Number(
    (
      seatedEyeHeight(variant) -
      ROOF_TENT_SPEC.standingEyeHeight +
      ROOF_TENT_SPEC.seatRiderOffset
    ).toFixed(4),
  );
}
