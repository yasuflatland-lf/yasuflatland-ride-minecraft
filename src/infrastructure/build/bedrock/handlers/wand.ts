import { type Player, system, world } from "@minecraft/server";
import type { ClearSelection } from "../../../../application/build/clearSelection";
import type { SetCorner } from "../../../../application/build/setCorner";
import { asDimensionId, asPlayerId } from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { SELECTION_WAND_TYPE } from "../../identifiers";

export function registerWand(
  setCorner: SetCorner,
  clear: ClearSelection,
): void {
  world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
    if (damagingEntity.typeId !== "minecraft:player") return;
    const player = damagingEntity as Player;
    if (!player?.isValid || heldTypeId(player) !== SELECTION_WAND_TYPE) return;
    setCorner.execute({
      playerId: asPlayerId(player.id),
      corner: "pos1",
      dimensionId: asDimensionId(hitBlock.dimension.id),
      cell: hitBlock.location,
    });
  });
  // Cancelling the break preserves the block after the first hit sets pos1 (ADR 0178, Decision 8).
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (heldTypeId(ev.player) === SELECTION_WAND_TYPE) ev.cancel = true;
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (heldTypeId(ev.player) !== SELECTION_WAND_TYPE) return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const command = {
      playerId: asPlayerId(player.id),
      corner: "pos2" as const,
      dimensionId: asDimensionId(ev.block.dimension.id),
      cell: ev.block.location,
    };
    system.run(() => {
      if (player.isValid) setCorner.execute(command);
    });
  });
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (
      source.isValid &&
      itemStack.typeId === SELECTION_WAND_TYPE &&
      source.isSneaking
    ) {
      clear.execute({ playerId: asPlayerId(source.id) });
    }
  });
}
