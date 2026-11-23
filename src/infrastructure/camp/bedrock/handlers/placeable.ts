import {
  Direction,
  type Entity,
  Player,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";

export type PlaceContext = {
  player: PlayerId;
  dimension: DimensionId;
  block: Vector3;
  yaw: number;
  slot: number;
};

export type HitContext = {
  entity: Entity;
  attacker: Player;
  player: PlayerId;
  tick: number;
};

export function registerPlaceableEntity(opts: {
  itemId: string;
  entityTypeIds: ReadonlySet<string>;
  canUseBlock(
    dimension: DimensionId,
    block: Vector3,
    face: "up" | "other",
  ): boolean;
  place(ctx: PlaceContext): void;
  hit(ctx: HitContext): void;
  placements?: TickScopedSet<PlayerId>;
}): void {
  const placements = opts.placements ?? new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== opts.itemId) return;
    const dimension = asDimensionId(ev.block.dimension.id);
    const block = ev.block.location;
    if (
      !opts.canUseBlock(
        dimension,
        block,
        ev.blockFace === Direction.Up ? "up" : "other",
      )
    )
      return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!placements.add(system.currentTick, player)) return;
    const yaw = ev.player.getRotation().y;
    const slot = ev.player.selectedSlotIndex;
    system.run(() => opts.place({ player, dimension, block, yaw, slot }));
  });
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      !opts.entityTypeIds.has(ev.hitEntity.typeId)
    )
      return;
    opts.hit({
      entity: ev.hitEntity,
      attacker: ev.damagingEntity,
      player: asPlayerId(ev.damagingEntity.id),
      tick: system.currentTick,
    });
  });
}
