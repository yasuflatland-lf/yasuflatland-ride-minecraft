import type { Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

export function seatPosition(tentLocation: Vec3): Vec3 {
  return { ...tentLocation, y: tentLocation.y + ROOF_TENT_SPEC.seatLift };
}

export function needsHold(current: Vec3, seat: Vec3): boolean {
  return (
    Math.hypot(current.x - seat.x, current.y - seat.y, current.z - seat.z) >
    ROOF_TENT_SPEC.seatTolerance
  );
}
