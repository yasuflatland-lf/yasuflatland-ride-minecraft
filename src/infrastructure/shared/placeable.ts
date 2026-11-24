import { system, world } from "@minecraft/server";
import type { BlockFace } from "../../domain/shared/blockFace";
import { type Cell, cellOf } from "../../domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../domain/shared/ids";
import { TickScopedSet } from "../../domain/shared/tickScoped";

import { blockFaceOf } from "./faces";

export interface ItemOnBlock<K> {
  player: PlayerId;
  dimension: DimensionId;
  block: Cell;
  face: BlockFace;
  yaw: number;
  slot: number;
  kind: K;
}

export function subscribeItemOnBlock<K>(opts: {
  kindOf(itemId: string): K | undefined;
  accept?(dimension: DimensionId, block: Cell, face: BlockFace): boolean;
  place(ctx: ItemOnBlock<K>): void;
  /** Share with entity interactions when either event can handle the same press. */
  placements?: TickScopedSet<PlayerId>;
}): void {
  const placements = opts.placements ?? new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || !ev.itemStack) return;
    const kind = opts.kindOf(ev.itemStack.typeId);
    if (kind === undefined) return;
    const dimension = asDimensionId(ev.block.dimension.id);
    const block = cellOf(ev.block.location);
    const face = blockFaceOf(ev.blockFace);
    if (opts.accept && !opts.accept(dimension, block, face)) return;

    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!placements.add(system.currentTick, player)) return;
    // Before-events cannot change the world. Capture the press before deferring (ADR 0024).
    const yaw = ev.player.getRotation().y;
    const slot = ev.player.selectedSlotIndex;
    system.run(() =>
      opts.place({ player, dimension, block, face, yaw, slot, kind }),
    );
  });
}
