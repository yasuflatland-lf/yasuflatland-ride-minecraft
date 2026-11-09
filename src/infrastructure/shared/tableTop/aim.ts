import type { Entity, Player } from "@minecraft/server";
import type { TopOutcome } from "../../../application/shared/placeOnTop";
import {
  aimOnPlane,
  hostLocalPx,
  type LocalPoint,
  type TopSurface,
} from "../../../domain/shared/tableTop";
import type { TopHostType } from "./registry";

export function topAim(
  player: Player,
  entity: Entity,
  surface: TopSurface,
): LocalPoint | undefined {
  const host = { at: entity.location, yaw: entity.getRotation().y };
  const point = aimOnPlane(
    player.getHeadLocation(),
    player.getViewDirection(),
    host.at.y + surface.topPx / 16,
  );
  return point ? hostLocalPx(host, point) : undefined;
}

export function showTopRefusal(
  player: Player,
  type: TopHostType,
  outcome: TopOutcome,
): void {
  if (outcome === "placed" || outcome === "refused" || !player.isValid) return;
  player.onScreenDisplay.setActionBar({
    translate: type.refusalHints[outcome],
  });
}
