import { type Cell, cellKey, cellOf } from "../shared/cells";
import { forward, rightOf } from "../shared/vec";
import {
  type BeachChairPose,
  beachChairCells,
  beachChairOrigin,
} from "./beachChair";
import { BEACH_CHAIR_SPEC } from "./spec";

export function beachChairExit(
  pose: BeachChairPose,
  isSafe: (feet: Cell) => boolean,
): Cell | undefined {
  const origin = beachChairOrigin(pose);
  const side = rightOf(forward(pose.yaw));
  const start = cellOf({
    x: origin.x + Math.round(side.x) * BEACH_CHAIR_SPEC.exitSideOffset,
    y: origin.y,
    z: origin.z + Math.round(side.z) * BEACH_CHAIR_SPEC.exitSideOffset,
  });
  const occupied = new Set(beachChairCells(pose).map(cellKey));
  for (let radius = 0; radius <= BEACH_CHAIR_SPEC.exitSearchRadius; radius++)
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        for (
          let dy = BEACH_CHAIR_SPEC.exitSearchUp;
          dy >= -BEACH_CHAIR_SPEC.exitSearchDown;
          dy--
        ) {
          const feet = { x: start.x + dx, y: start.y + dy, z: start.z + dz };
          if (occupied.has(cellKey({ ...feet, y: pose.foot.y }))) continue;
          if (isSafe(feet)) return feet;
        }
      }
  return undefined;
}
