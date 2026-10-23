// The vanilla dye for each paint, the paint each dye gives, and the variant index
// and entity event that apply a paint to every painted entity (ADR 0031, 0135).

import type { Player } from "@minecraft/server";
import { PAINTS, type Paint, paintEventName } from "../../domain/shared/paint";
import { id } from "./identifiers";

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

/** minecraft:variant value for each paint. The render controller of each painted entity picks the texture by this index. */
export const PAINT_VARIANT: Readonly<Record<Paint, number>> =
  Object.fromEntries(PAINTS.map((paint, i) => [paint, i])) as Record<
    Paint,
    number
  >;
/**
 * Entity event, declared in every painted entity file (the vehicles' and the
 * tent's .se.json), that sets the variant for a paint (ADR 0031).
 */
export function paintEvent(paint: Paint): string {
  return id(paintEventName(paint));
}
