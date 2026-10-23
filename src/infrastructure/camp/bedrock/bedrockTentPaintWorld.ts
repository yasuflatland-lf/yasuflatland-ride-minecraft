// Implements TentPaintWorld with @minecraft/server (ADR 0012).
import { type Entity, Player, world } from "@minecraft/server";
import type { TentPaintWorld } from "../../../application/camp/ports/tentPaint";
import type { TentId } from "../../../domain/camp/tent";
import type { PlayerId } from "../../../domain/shared/ids";
import { PAINTS, type Paint } from "../../../domain/shared/paint";
import { dyeOf, paintEvent } from "../../shared/dyes";
import { consumeHeld, isCreative } from "../../shared/players";
import { TENT_TYPE } from "../identifiers";

export class BedrockTentPaintWorld implements TentPaintWorld {
  paintOf(tentId: TentId): Paint | undefined {
    const tent = this.tent(tentId);
    if (!tent) return undefined;
    return PAINTS[tent.getComponent("minecraft:variant")?.value ?? 0];
  }

  paint(tentId: TentId, paint: Paint): void {
    const tent = this.tent(tentId);
    if (!tent) return;
    tent.triggerEvent(paintEvent(paint));
    tent.dimension.playSound("dye.use", tent.location);
  }

  consumeDye(playerId: PlayerId, paint: Paint): void {
    const player = this.player(playerId);
    if (player) consumeHeld(player, dyeOf(paint), player.selectedSlotIndex);
  }

  isCreative(playerId: PlayerId): boolean {
    return isCreative(this.player(playerId));
  }

  private tent(tentId: TentId): Entity | undefined {
    const entity = world.getEntity(tentId);
    return entity?.isValid && entity.typeId === TENT_TYPE ? entity : undefined;
  }

  private player(playerId: PlayerId): Player | undefined {
    const entity = world.getEntity(playerId);
    return entity instanceof Player ? entity : undefined;
  }
}
