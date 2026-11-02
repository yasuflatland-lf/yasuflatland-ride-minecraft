import type { Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

export function seatPosition(tentLocation: Vec3): Vec3 {
  return { ...tentLocation, y: tentLocation.y + ROOF_TENT_SPEC.seatLift };
}

export type RoofTentSeatVariant = "suv" | "ground";

/** Ground and camper tents seat the rider's feet on the platform; only the SUV shell is tall enough to derive it from the eye. */
export function rideSeatY(variant: RoofTentSeatVariant = "suv"): number {
  if (variant === "ground")
    return Number(
      (
        ROOF_TENT_SPEC.groundPlatformTop + ROOF_TENT_SPEC.seatRiderOffset
      ).toFixed(4),
    );
  return Number(
    (
      ROOF_TENT_SPEC.occupantEyeHeight -
      ROOF_TENT_SPEC.standingEyeHeight +
      ROOF_TENT_SPEC.seatRiderOffset
    ).toFixed(4),
  );
}
