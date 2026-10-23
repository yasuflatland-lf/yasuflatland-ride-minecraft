import { degToRad } from "../../../shared/vec";
import type { TrackGeometry } from "./spec";

export interface TrackTravel {
  readonly r: number;
  readonly l: number;
}

export function advanceTracks(
  travel: TrackTravel,
  speed: number,
  yawDelta: number,
  geometry: TrackGeometry,
): TrackTravel {
  const turn = degToRad(yawDelta) * geometry.halfGauge;
  return { r: travel.r + speed - turn, l: travel.l + speed + turn };
}

export function trackPhase(travel: number, phaseStep: number): 0 | 1 | 2 {
  return (((Math.floor(travel / phaseStep) % 3) + 3) % 3) as 0 | 1 | 2;
}

export function trackSpin(travel: number, radius: number): number {
  return ((Math.round(((travel / radius) * 180) / Math.PI) % 360) + 360) % 360;
}
