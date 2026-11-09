import { GameMode, Player, system, world } from "@minecraft/server";
import type { FurnitureTopBlocksWorld } from "../../../../application/resort/ports/furnitureTopBlocks";
import type { TakeBackFurniture } from "../../../../application/resort/takeBackFurniture";
import { asFurnitureId, type FurnitureId } from "../../../../domain/resort/ids";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldDye } from "../../../shared/dyes";
import { DINING_TABLE_TOP, furnitureKindOf } from "../../identifiers";

export function registerFurnitureHits(
  takeBack: TakeBackFurniture,
  tops: Pick<FurnitureTopBlocksWorld, "ownerAt">,
): void {
  const requested = new TickScopedSet<PlayerId>();
  const hit = (entity: Player, id: FurnitureId) => {
    const player = asPlayerId(entity.id);
    if (heldDye(entity) || !requested.add(system.currentTick, player)) return;
    const cmd = {
      id,
      player,
      now: system.currentTick,
    };
    system.run(() => takeBack.hit(cmd));
  };
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      furnitureKindOf(ev.hitEntity.typeId, "entity") === undefined
    )
      return;
    hit(ev.damagingEntity, asFurnitureId(ev.hitEntity.id));
  });
  world.afterEvents.entityHitBlock.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitBlock.typeId !== DINING_TABLE_TOP
    )
      return;
    const id = tops.ownerAt(
      asDimensionId(ev.hitBlock.dimension.id),
      ev.hitBlock.location,
    );
    if (id !== undefined) hit(ev.damagingEntity, id);
  });
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (
      ev.player.getGameMode() !== GameMode.Creative ||
      ev.block.typeId !== DINING_TABLE_TOP
    )
      return;
    const id = tops.ownerAt(asDimensionId(ev.dimension.id), ev.block.location);
    if (id !== undefined) hit(ev.player, id);
  });
}
