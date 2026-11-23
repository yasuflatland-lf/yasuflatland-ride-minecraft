import type { Cell } from "../shared/cells";
import { searchExitCell } from "../shared/exitSearch";
import type { Facing4 } from "../shared/facing";
import { forward } from "../shared/vec";
import { TOILET_SPEC } from "./shows";

export function toiletExit(
  origin: Cell,
  facing: Facing4,
  isSafe: (feet: Cell) => boolean,
): Cell | undefined {
  const front = forward(facing);
  const start = {
    x: origin.x + Math.round(front.x * TOILET_SPEC.exitFrontOffset),
    y: origin.y,
    z: origin.z + Math.round(front.z * TOILET_SPEC.exitFrontOffset),
  };
  return searchExitCell(
    start,
    (feet) => feet.x === origin.x && feet.z === origin.z,
    {
      radius: TOILET_SPEC.exitSearchRadius,
      up: TOILET_SPEC.exitSearchUp,
      down: TOILET_SPEC.exitSearchDown,
    },
    isSafe,
  );
}
