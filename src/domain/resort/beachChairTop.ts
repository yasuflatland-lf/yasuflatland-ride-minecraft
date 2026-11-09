import type { Cell } from "../shared/cells";
import type { Facing4 } from "../shared/facing";
import type { LocalPoint, TopRect } from "../shared/tableTop";
import type { Vec3 } from "../shared/vec";

/** Quarter-turn hosts keep their rectangular footprints aligned with world cells. */
export function beachChairItemCells(
  origin: Vec3,
  yaw: Facing4,
  at: LocalPoint,
  footprint: TopRect,
): Cell[] {
  const cos = yaw === 0 ? 1 : yaw === 180 ? -1 : 0;
  const sin = yaw === 90 ? 1 : yaw === 270 ? -1 : 0;
  const x = origin.x + (at.x * cos - at.z * sin) / 16;
  const z = origin.z + (at.x * sin + at.z * cos) / 16;
  const halfX =
    (Math.abs(cos) * footprint.halfX + Math.abs(sin) * footprint.halfZ) / 16;
  const halfZ =
    (Math.abs(sin) * footprint.halfX + Math.abs(cos) * footprint.halfZ) / 16;
  const cells: Cell[] = [];
  for (let cx = Math.floor(x - halfX); cx < Math.ceil(x + halfX); cx++)
    for (let cz = Math.floor(z - halfZ); cz < Math.ceil(z + halfZ); cz++)
      cells.push({ x: cx, y: Math.floor(origin.y) + 1, z: cz });
  return cells;
}
