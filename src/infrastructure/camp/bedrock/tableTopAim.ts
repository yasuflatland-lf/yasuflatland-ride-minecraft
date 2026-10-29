import type { Entity, Player } from "@minecraft/server";
import type { TableTopOutcome } from "../../../application/camp/placeOnTableTop";
import { aimOnPlane, hostLocalPx } from "../../../domain/camp/dutchOven";
import { TABLE_TOP_PX } from "../../../domain/camp/spec";
import type { LocalPoint } from "../../../domain/camp/tabletop";
import { TABLE_TOP_REFUSAL_HINTS } from "../identifiers";

/** Where the player's view ray meets the table top, in the table's local pixels. */
export function tableTopAim(
  player: Player,
  table: Entity,
): LocalPoint | undefined {
  const host = { at: table.location, yaw: table.getRotation().y };
  const point = aimOnPlane(
    player.getHeadLocation(),
    player.getViewDirection(),
    host.at.y + TABLE_TOP_PX / 16,
  );
  return point ? hostLocalPx(host, point) : undefined;
}

/** Tells the player why the table top refused the item, when the rule did. */
export function showTableTopRefusal(
  player: Player,
  outcome: TableTopOutcome,
): void {
  if (outcome === "placed" || outcome === "refused" || !player.isValid) return;
  player.onScreenDisplay.setActionBar({
    translate: TABLE_TOP_REFUSAL_HINTS[outcome],
  });
}
