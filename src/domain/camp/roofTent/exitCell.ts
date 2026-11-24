import type { Facing4 } from "../../shared/facing";
import { LocalFrame } from "../../shared/frame";
import type { RoofTentMount } from "../../shared/roofTent";
import { distanceXZ, forward, type Vec3 } from "../../shared/vec";
import { entranceWorld } from "./access";

const EXIT_STEP = 1;
const CELL_ROUNDING_MARGIN = 2 * EXIT_STEP;

export function exitCell(
  mount: RoofTentMount,
  host: { location: Vec3; yaw: number },
  facing: Facing4,
): Vec3 {
  const entrance = entranceWorld(mount, host);
  const dx = mount.entrance.x - mount.anchor.x;
  const dz = mount.entrance.z - mount.anchor.z;
  const length = Math.hypot(dx, dz);
  const direction =
    length === 0
      ? forward(facing)
      : new LocalFrame(host.location, host.yaw).toWorldOffset({
          left: dx / length,
          ahead: dz / length,
          up: 0,
        });
  const radius = distanceXZ(entrance, host.location);
  const cellAt = (distance: number): Vec3 => ({
    x: Math.floor(entrance.x + direction.x * distance) || 0,
    y: Math.floor(host.location.y) || 0,
    z: Math.floor(entrance.z + direction.z * distance) || 0,
  });
  const cell = cellAt(EXIT_STEP);
  if (
    distanceXZ(cell, host.location) > radius &&
    (cell.x !== Math.floor(entrance.x) || cell.z !== Math.floor(entrance.z))
  )
    return cell;
  // Even an inward exit ray eventually leaves the entrance-radius circle.
  // Two radii plus a rounding margin keeps the floored cell outside it.
  return cellAt(2 * radius + CELL_ROUNDING_MARGIN + EXIT_STEP);
}
