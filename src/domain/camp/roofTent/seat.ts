import type { Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

export function seatPosition(tentLocation: Vec3): Vec3 {
  return { ...tentLocation, y: tentLocation.y + ROOF_TENT_SPEC.seatLift };
}

export function rideSeatY(): number {
  return Number(
    (
      ROOF_TENT_SPEC.occupantEyeHeight -
      ROOF_TENT_SPEC.standingEyeHeight +
      ROOF_TENT_SPEC.seatRiderOffset
    ).toFixed(4),
  );
}
