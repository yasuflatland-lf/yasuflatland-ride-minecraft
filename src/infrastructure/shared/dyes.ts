// The vanilla dye for each paint, the paint each dye gives, and the entity event
// that applies a paint to each painted entity (ADR 0031, 0135).

import { type Entity, type Player, world } from "@minecraft/server";
import type { RepaintWorld } from "../../application/shared/ports/repaint";
import type { PlayerId } from "../../domain/shared/ids";
import { PAINTS, type Paint, paintEventName } from "../../domain/shared/paint";
import { entityOfType } from "./entities";
import { heldTypeId } from "./heldItem";
import { id, NAMESPACE } from "./identifiers";
import { consumeHeld, isCreative, playerById } from "./players";

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
  return PAINT_BY_DYE[heldTypeId(player) ?? ""];
}

/**
 * Entity event, declared in every painted entity file (the vehicles' and the
 * tent's .se.json), that sets the variant for a paint (ADR 0031).
 */
export function paintEvent(paint: Paint): string {
  return id(paintEventName(paint));
}

const PAINT_SOUND = "dye.use";

/**
 * The dye sound at a painted entity. The dye is used up before it plays, so a
 * failing sound is only logged and never rethrown.
 */
export function playPaintSound(entity: Entity): void {
  try {
    entity.dimension.playSound(PAINT_SOUND, entity.location);
  } catch (error) {
    console.warn(`[${NAMESPACE}] paint sound failed: ${error}`);
  }
}

export class BedrockVariantPaintWorld<Id extends string>
  implements RepaintWorld<Id>
{
  constructor(
    private readonly typeId: string,
    private readonly defaultPaint: Paint,
  ) {}

  private entity(id: Id): Entity | undefined {
    return entityOfType(world, id, this.typeId);
  }

  paintOf(id: Id): Paint | undefined {
    const entity = this.entity(id);
    return entity
      ? PAINTS[entity.getComponent("minecraft:variant")?.value ?? 0]
      : undefined;
  }

  defaultPaintOf(id: Id): Paint | undefined {
    return this.entity(id) ? this.defaultPaint : undefined;
  }

  setPaint(id: Id, paint: Paint): void {
    this.entity(id)?.triggerEvent(paintEvent(paint));
  }

  consumeDye(id: PlayerId, paint: Paint): void {
    const player = playerById(id);
    if (player) consumeHeld(player, dyeOf(paint), player.selectedSlotIndex);
  }

  playPaintSound(id: Id): void {
    const entity = this.entity(id);
    if (entity) playPaintSound(entity);
  }

  isCreative(id: PlayerId): boolean {
    return isCreative(playerById(id));
  }
}
