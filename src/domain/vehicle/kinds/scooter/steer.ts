import { clamp } from "../../../shared/vec";

export function steerAngle(
  steerInput: number,
  limits: { readonly maxSteer: number },
): number {
  return clamp(steerInput, -1, 1) * limits.maxSteer || 0;
}
