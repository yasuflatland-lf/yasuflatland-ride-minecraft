import type { Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

/** The teleport fallback stays at the raised shell height, above every platform. */
export function seatPosition(tentLocation: Vec3): Vec3 {
  return { ...tentLocation, y: tentLocation.y + ROOF_TENT_SPEC.seatLift };
}
