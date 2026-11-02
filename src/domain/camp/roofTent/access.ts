import type { RoofTentMount } from "../../shared/roofTent";
import { forward, leftOf, type Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

export function entranceWorld(
  mount: RoofTentMount,
  host: { location: Vec3; yaw: number },
): { x: number; z: number } {
  const f = forward(host.yaw);
  const l = leftOf(f);
  return {
    x: host.location.x + l.x * mount.entrance.x + f.x * mount.entrance.z,
    z: host.location.z + l.z * mount.entrance.x + f.z * mount.entrance.z,
  };
}

export function canReachEntrance(
  mount: RoofTentMount,
  host: { location: Vec3; yaw: number },
  player: Vec3,
): boolean {
  const entrance = entranceWorld(mount, host);
  return (
    Math.hypot(player.x - entrance.x, player.z - entrance.z) <=
      ROOF_TENT_SPEC.entranceReach &&
    ((mount.ladder &&
      Math.abs(player.y - host.location.y) <= ROOF_TENT_SPEC.entranceBand) ||
      Math.abs(player.y - (host.location.y + mount.roofHeight)) <=
        ROOF_TENT_SPEC.entranceBand)
  );
}
