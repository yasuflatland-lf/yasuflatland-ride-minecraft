import { type Cell, cellKey } from "../shared/cells";
import { searchExitCell } from "../shared/exitSearch";
import { forward, rightOf } from "../shared/vec";
import { type BeachChairPose, beachChairCells } from "./beachChair";
import { BEACH_CHAIR_SPEC } from "./spec";

export function beachChairExit(
  pose: BeachChairPose,
  isSafe: (feet: Cell) => boolean,
): Cell | undefined {
  const side = rightOf(forward(pose.yaw));
  const start = {
    x: pose.middle.x + Math.round(side.x) * BEACH_CHAIR_SPEC.exitSideOffset,
    y: pose.middle.y,
    z: pose.middle.z + Math.round(side.z) * BEACH_CHAIR_SPEC.exitSideOffset,
  };
  const occupied = new Set(beachChairCells(pose).map(cellKey));
  return searchExitCell(
    start,
    (feet) => occupied.has(cellKey({ ...feet, y: pose.foot.y })),
    {
      radius: BEACH_CHAIR_SPEC.exitSearchRadius,
      up: BEACH_CHAIR_SPEC.exitSearchUp,
      down: BEACH_CHAIR_SPEC.exitSearchDown,
    },
    isSafe,
  );
}
