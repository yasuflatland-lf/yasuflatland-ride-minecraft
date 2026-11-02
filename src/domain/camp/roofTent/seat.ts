import type { Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

export function seatPosition(tentLocation: Vec3): Vec3 {
  return { ...tentLocation, y: tentLocation.y + ROOF_TENT_SPEC.seatLift };
}

export function rideSeatY(): number {
  return ROOF_TENT_SPEC.seatLift + ROOF_TENT_SPEC.seatRiderOffset;
}
