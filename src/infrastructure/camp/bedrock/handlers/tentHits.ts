// Routes a player's hit on a tent from outside: on its blocks, which stay
// world-aligned at every yaw, and on the entity's hidden box (ADR 0130, 0131).
// A held dye repaints instead and never counts toward taking it down (ADR 0036, 0135).
import { GameMode, Player, system, world } from "@minecraft/server";
import type { PaintTent } from "../../../../application/camp/paintTent";
import type { TakeDownTent } from "../../../../application/camp/takeDownTent";
import { asTentId, type TentId } from "../../../../domain/camp/tent";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import type { Paint } from "../../../../domain/shared/paint";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import type { Vec3 } from "../../../../domain/shared/vec";
import { heldDye } from "../../../shared/dyes";
import { TENT_TYPE } from "../../identifiers";

export function registerTentHits(
  takeDown: TakeDownTent,
  paintTent: PaintTent,
  owner: (
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ) => TentId | undefined,
): void {
  // A Creative break and a block hit can both fire for one swing; it counts once.
  const swung = new TickScopedSet<PlayerId>();
  const hitTent = (
    tentId: TentId,
    playerId: PlayerId,
    paint: Paint | undefined,
    tick: number,
  ) => {
    if (!swung.add(tick, playerId)) return;
    // Before TakeDownTent, so a dye repaints even while someone is inside.
    if (paint) {
      paintTent.execute({ playerId, tentId, paint, tick });
      return;
    }
    takeDown.execute({ tentId, tick, playerId });
  };
  world.afterEvents.entityHitBlock.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!(player instanceof Player)) return;
    const block = ev.hitBlock;
    const tentId = owner(
      asDimensionId(block.dimension.id),
      block.location,
      block.typeId,
    );
    if (tentId !== undefined)
      hitTent(
        tentId,
        asPlayerId(player.id),
        heldDye(player),
        system.currentTick,
      );
  });
  // The shared laid-block guard cancels the break; this only counts it.
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const { player, block } = ev;
    if (player.getGameMode() !== GameMode.Creative) return;
    const tentId = owner(
      asDimensionId(ev.dimension.id),
      block.location,
      block.typeId,
    );
    if (tentId === undefined) return;
    const tick = system.currentTick;
    // Read now, so the paint is the dye that was swung; the player may have
    // left by the deferred tick, when its handle can no longer be read.
    const playerId = asPlayerId(player.id);
    const paint = heldDye(player);
    system.run(() => {
      if (player.isValid) hitTent(tentId, playerId, paint, tick);
    });
  });
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!(player instanceof Player) || ev.hitEntity.typeId !== TENT_TYPE)
      return;
    hitTent(
      asTentId(ev.hitEntity.id),
      asPlayerId(player.id),
      heldDye(player),
      system.currentTick,
    );
  });
}
