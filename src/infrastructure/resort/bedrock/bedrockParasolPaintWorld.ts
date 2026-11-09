import { type Entity, Player, world } from "@minecraft/server";
import type { RepaintWorld } from "../../../application/shared/ports/repaint";
import type { ParasolId } from "../../../domain/resort/ids";
import { PARASOL_SPEC } from "../../../domain/resort/spec";
import type { PlayerId } from "../../../domain/shared/ids";
import { PAINTS, type Paint } from "../../../domain/shared/paint";
import { dyeOf, paintEvent, playPaintSound } from "../../shared/dyes";
import { consumeHeld, isCreative } from "../../shared/players";
import { BEACH_PARASOL } from "../identifiers";

export class BedrockParasolPaintWorld implements RepaintWorld<ParasolId> {
  paintOf(id: ParasolId): Paint | undefined {
    const entity = this.parasol(id);
    return entity
      ? PAINTS[entity.getComponent("minecraft:variant")?.value ?? 0]
      : undefined;
  }
  defaultPaintOf(id: ParasolId): Paint | undefined {
    return this.parasol(id) ? PARASOL_SPEC.defaultPaint : undefined;
  }
  setPaint(id: ParasolId, paint: Paint): void {
    this.parasol(id)?.triggerEvent(paintEvent(paint));
  }
  consumeDye(id: PlayerId, paint: Paint): void {
    const player = this.player(id);
    if (player) consumeHeld(player, dyeOf(paint), player.selectedSlotIndex);
  }
  playPaintSound(id: ParasolId): void {
    const entity = this.parasol(id);
    if (entity) playPaintSound(entity);
  }
  isCreative(id: PlayerId): boolean {
    return isCreative(this.player(id));
  }
  private parasol(id: ParasolId): Entity | undefined {
    const entity = world.getEntity(id);
    return entity?.isValid && entity.typeId === BEACH_PARASOL
      ? entity
      : undefined;
  }
  private player(id: PlayerId): Player | undefined {
    const entity = world.getEntity(id);
    return entity instanceof Player ? entity : undefined;
  }
}
