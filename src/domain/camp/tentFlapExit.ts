// Adjacent exit cells for feet in an open flap (ADR 0212).
import type { Cell } from "../shared/cells";
import type { Vec3 } from "../shared/vec";
import { type FlapId, type TentPose, tentCellAt } from "./tent";

/** Preferred and opposite cells along the wall normal; centre ties go inside. */
export function tentFlapExitCells(
  pose: TentPose,
  flap: FlapId,
  cell: Cell,
  feet: Vec3,
): readonly [Cell, Cell] {
  const alongDepth = flap === "front" || flap === "bedroom";
  const step = tentCellAt(pose, {
    x: alongDepth ? 0 : 1,
    depth: alongDepth ? 1 : 0,
    layer: 0,
  });
  const normal = { x: step.x - pose.x, z: step.z - pose.z };
  const offset =
    (feet.x - cell.x - 0.5) * normal.x + (feet.z - cell.z - 0.5) * normal.z;
  const side = offset === 0 ? (flap === "left" ? -1 : 1) : Math.sign(offset);
  const target = (sign: number): Cell => ({
    x: cell.x + sign * normal.x,
    y: cell.y,
    z: cell.z + sign * normal.z,
  });
  return [target(side), target(-side)];
}
