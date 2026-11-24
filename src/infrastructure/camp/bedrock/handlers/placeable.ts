import {
  type Entity,
  Player,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import type { BlockFace } from "../../../../domain/shared/blockFace";
import {
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import type { TickScopedSet } from "../../../../domain/shared/tickScoped";
import {
  type ItemOnBlock,
  subscribeItemOnBlock,
} from "../../../shared/placeable";

export type PlaceContext = Omit<ItemOnBlock<string>, "kind" | "face">;

export type HitContext = {
  entity: Entity;
  attacker: Player;
  player: PlayerId;
  tick: number;
};

export function registerPlaceableEntity(opts: {
  itemId: string;
  entityTypeIds: ReadonlySet<string>;
  canUseBlock(dimension: DimensionId, block: Vector3, face: BlockFace): boolean;
  place(ctx: PlaceContext): void;
  hit(ctx: HitContext): void;
  placements?: TickScopedSet<PlayerId>;
}): void {
  subscribeItemOnBlock({
    kindOf: (itemId) => (itemId === opts.itemId ? itemId : undefined),
    accept: opts.canUseBlock,
    placements: opts.placements,
    place: ({ kind: _kind, face: _face, ...ctx }) => opts.place(ctx),
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
