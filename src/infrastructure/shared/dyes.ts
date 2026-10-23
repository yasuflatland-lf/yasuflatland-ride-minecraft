// The vanilla dye for each paint, and the paint each dye gives.

import type { Player } from "@minecraft/server";
import { PAINTS, type Paint } from "../../domain/shared/paint";

/** The vanilla dye that paints an entity with a paint (ADR 0031); brown dye restores variant 0 (ADR 0076). */
export function dyeOf(paint: Paint): string {
  const color = paint === "khaki" ? "brown" : paint;
  return `minecraft:${color}_dye`;
}

export const PAINT_BY_DYE: Readonly<Record<string, Paint>> = Object.fromEntries(
  PAINTS.map((paint) => [dyeOf(paint), paint]),
);

/**
 * The paint of the dye in the player's selected slot, if they hold one. The one
 * read of a held dye, so painting and its hint cannot disagree.
 */
export function heldDye(player: Player): Paint | undefined {
  const held = player
    .getComponent("minecraft:inventory")
    ?.container?.getItem(player.selectedSlotIndex);
  return PAINT_BY_DYE[held?.typeId ?? ""];
}
