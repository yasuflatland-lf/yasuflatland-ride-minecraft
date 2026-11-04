import type { Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

/** The teleport fallback stays at the SUV-lifted height, above every platform. */
export function seatPosition(tentLocation: Vec3): Vec3 {
  return { ...tentLocation, y: tentLocation.y + ROOF_TENT_SPEC.seatLift };
}

export type RoofTentSeatVariant = "ladder" | "ground";

const SHELL_RIDGE: Record<RoofTentSeatVariant, number> = {
  ladder: ROOF_TENT_SPEC.shellRidge,
  ground: ROOF_TENT_SPEC.groundShellRidge,
};

/** Eye height above the tent origin: the same clearance below the variant's own ridge. */
function seatedEyeHeight(variant: RoofTentSeatVariant): number {
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
