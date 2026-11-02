import type { RoofTentMount } from "../../shared/roofTent";
import { forward, leftOf, type Vec3 } from "../../shared/vec";
import type { Facing4 } from "./facing";

const EXIT_STEP = 1;
const CELL_ROUNDING_MARGIN = 2 * EXIT_STEP;

export function exitCell(
  mount: RoofTentMount,
  host: { location: Vec3; yaw: number },
  facing: Facing4,
): Vec3 {
  const f = forward(host.yaw);
  const l = leftOf(f);
  const entrance = {
    x: host.location.x + l.x * mount.entrance.x + f.x * mount.entrance.z,
    z: host.location.z + l.z * mount.entrance.x + f.z * mount.entrance.z,
  };
  const dx = mount.entrance.x - mount.anchor.x;
  const dz = mount.entrance.z - mount.anchor.z;
  const length = Math.hypot(dx, dz);
  const direction =
    length === 0
      ? forward(facing)
      : {
          x: l.x * (dx / length) + f.x * (dz / length),
          z: l.z * (dx / length) + f.z * (dz / length),
        };
  const radius = Math.hypot(
    entrance.x - host.location.x,
    entrance.z - host.location.z,
  );
  const cellAt = (distance: number): Vec3 => ({
    x: Math.floor(entrance.x + direction.x * distance) || 0,
    y: Math.floor(host.location.y) || 0,
    z: Math.floor(entrance.z + direction.z * distance) || 0,
  });
  const cell = cellAt(EXIT_STEP);
  if (
    Math.hypot(cell.x - host.location.x, cell.z - host.location.z) > radius &&
    (cell.x !== Math.floor(entrance.x) || cell.z !== Math.floor(entrance.z))
  )
    return cell;
  // Even an inward exit ray eventually leaves the entrance-radius circle.
  // Two radii plus a rounding margin keeps the floored cell outside it.
  return cellAt(2 * radius + CELL_ROUNDING_MARGIN + EXIT_STEP);
}
