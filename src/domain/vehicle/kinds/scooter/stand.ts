import { SCOOTER_SPEC } from "./spec";

export function standDown(
  occupied: boolean,
  speed: number,
  onWater: boolean,
): boolean {
  return !occupied && Math.abs(speed) < SCOOTER_SPEC.standSpeed && !onWater;
}
