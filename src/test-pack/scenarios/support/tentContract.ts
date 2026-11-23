import { type TentPose, tentCellAt } from "../../../domain/camp/tent";
import { TRAPEZOID_LAYOUT } from "../../../domain/camp/tentLayout";
import type { Cell } from "../../../domain/shared/cells";
import { id } from "../../../infrastructure/shared/identifiers";

/** Listed in tent.se.json's minecraft:type_family. */
export const TENT_FAMILY = "yasu_ride_tent";

/** Listed in roof_tent.se.json's minecraft:type_family. */
export const ROOF_TENT_FAMILY = id("roof_tent");

export function lanternCell(pose: TentPose): Cell {
  return tentCellAt(pose, TRAPEZOID_LAYOUT.lantern);
}
