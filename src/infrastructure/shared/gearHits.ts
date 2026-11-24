import {
  type Block,
  type Entity,
  GameMode,
  Player,
  system,
  world,
} from "@minecraft/server";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../domain/shared/ids";
import type { Paint } from "../../domain/shared/paint";
import { TickScopedSet } from "../../domain/shared/tickScoped";
import type { Vec3 } from "../../domain/shared/vec";
import { heldDye } from "./dyes";

interface GearHit<Id> {
  id: Id;
  player: PlayerId;
  tick: number;
}

export function subscribeGearHits<Id>(opts: {
  idOf(entity: Entity): Id | undefined;
  ownerOfBlock?(
    dimension: DimensionId,
    cell: Vec3,
    typeId: string,
  ): Id | undefined;
  onDye?(cmd: GearHit<Id> & { paint: Paint }): void;
  onHit(cmd: GearHit<Id>): void;
  defer: boolean;
}): void {
  const hits = new TickScopedSet<PlayerId>();
  const dyes = new TickScopedSet<PlayerId>();

  function hit(player: Player, id: Id | undefined, defer: boolean) {
    if (id === undefined) return;
    const paint = heldDye(player);
    if (paint !== undefined && !opts.onDye) return;

    const cmd = { id, player: asPlayerId(player.id), tick: system.currentTick };
    // One Creative swing may also hit the block. A dye swing has its own
    // slot so it cannot suppress a recovery hit in the same tick.
    const swings = paint === undefined ? hits : dyes;
    if (!swings.add(cmd.tick, cmd.player)) return;
    const dispatch = () => {
      if (!player.isValid) return;
      if (paint !== undefined) opts.onDye?.({ ...cmd, paint });
      else opts.onHit(cmd);
    };
    if (defer) system.run(dispatch);
    else dispatch();
  }

  world.afterEvents.entityHitEntity.subscribe(
    ({ damagingEntity, hitEntity }) => {
      if (damagingEntity instanceof Player)
        hit(damagingEntity, opts.idOf(hitEntity), opts.defer);
    },
  );

  const owner = opts.ownerOfBlock;
  if (!owner) return;
  const blockOwner = (block: Block) =>
    owner(asDimensionId(block.dimension.id), block.location, block.typeId);
  world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
    if (damagingEntity instanceof Player)
      hit(damagingEntity, blockOwner(hitBlock), opts.defer);
  });
  // The laid-block guard cancels the break. A before-event must always defer writes.
  world.beforeEvents.playerBreakBlock.subscribe(({ player, block }) => {
    if (player.getGameMode() === GameMode.Creative)
      hit(player, blockOwner(block), true);
  });
}
