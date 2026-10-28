import type { Vec3 } from "../../../shared/vec";
import type { CutColumn } from "../../cut";
import { boxColumns, rectCells } from "../../cutArea";
import { SPORTSBOAT_SPEC } from "./spec";

const { icebreaker, ramFront, ramHalfWidth, height } = SPORTSBOAT_SPEC;

export function bowBlocked(
  location: Vec3,
  yaw: number,
  solidAt: (offset: Vec3) => boolean,
): boolean {
  return rectCells(location, yaw, {
    near: icebreaker.probeNear,
    far: ramFront + icebreaker.probeAhead,
    halfWidth: ramHalfWidth,
  }).some((cell) =>
    icebreaker.probeHeights.some((y) =>
      solidAt({
        x: cell.x + 0.5 - location.x,
        y,
        z: cell.z + 0.5 - location.z,
      }),
    ),
  );
}

/** The block row the hull stands in; the cut never removes anything below it (ADR 0175). */
export function hullFloorRow(feetY: number): number {
  return Math.floor(feetY + icebreaker.floorEpsilon);
}

export function icebreakerColumns(location: Vec3, yaw: number): CutColumn[] {
  const bottom = hullFloorRow(location.y);
  return boxColumns(
    location,
    yaw,
    {
      near: -icebreaker.sternReach,
      far: ramFront + icebreaker.margin,
      halfWidth: ramHalfWidth + icebreaker.margin,
    },
    bottom,
    Math.ceil(location.y + height + icebreaker.margin) - bottom,
  );
}

export interface LastCut {
  readonly tick: number;
  readonly location: Vec3;
}

/** Whether a blocked bow cuts again on `tick` after the cut in `last` (ADR 0171). */
export function recutDue(
  last: LastCut | undefined,
  tick: number,
  location: Vec3,
): boolean {
  if (last === undefined) return true;
  const moved = Math.hypot(
    location.x - last.location.x,
    location.z - last.location.z,
  );
  return (
    moved >= icebreaker.recutDistance ||
    tick - last.tick >= icebreaker.recutTicks
  );
}
