import type { Vec3 } from "../shared/vec";

export type HorizontalAxis = "x" | "z";

export function dominantHorizontalAxis(direction: Vec3): HorizontalAxis {
  return Math.abs(direction.x) >= Math.abs(direction.z) ? "x" : "z";
}
