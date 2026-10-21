// The one read of a held dye, shared by painting and its hint so the two cannot disagree.
import type { Player } from "@minecraft/server";
import type { Paint } from "../../../domain/vehicle/paint/paint";
import { PAINT_BY_DYE } from "./identifiers";

/** The paint of the dye in the player's selected slot, if they hold one. */
export function heldDye(player: Player): Paint | undefined {
  const held = player
    .getComponent("minecraft:inventory")
    ?.container?.getItem(player.selectedSlotIndex);
  return PAINT_BY_DYE[held?.typeId ?? ""];
}
