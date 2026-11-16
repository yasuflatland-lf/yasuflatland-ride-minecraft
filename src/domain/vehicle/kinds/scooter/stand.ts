import { SCOOTER_SPEC } from "./spec";

export function standDown(
  occupied: boolean,
  speed: number,
  onWater: boolean,
  standSpeed: number = SCOOTER_SPEC.standSpeed,
): boolean {
  return !occupied && Math.abs(speed) < standSpeed && !onWater;
}
