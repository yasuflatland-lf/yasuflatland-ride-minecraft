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

export function icebreakerColumns(location: Vec3, yaw: number): CutColumn[] {
  const bottom = Math.floor(location.y) - icebreaker.margin;
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
