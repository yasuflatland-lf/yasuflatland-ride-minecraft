import { type Player, system, world } from "@minecraft/server";
import { tapTargetCell } from "../../../../domain/build/tapTarget";
import { asPlayerId } from "../../../../domain/shared/ids";
import { TAP_TARGET_TYPE } from "../../identifiers";
import type { BedrockTapTargets } from "../bedrockTapTargets";
import { heldBuildItem } from "../heldBuildItem";
import {
  type BlockPressContext,
  blockPressIntent,
  pressBlockCell,
} from "./wandPress";

export function registerTapTarget({
  targets,
  ...context
}: BlockPressContext & { targets: Pick<BedrockTapTargets, "ownerOf"> }) {
  const press = (player: Player, entityId: string, defer = false): void => {
    if (!player.isValid || heldBuildItem(player) !== "wand") return;
    const playerId = asPlayerId(player.id);
    const owner = targets.ownerOf(entityId);
    if (owner?.playerId !== playerId) return;
    const flow = context.repo.get(playerId)?.flow;
    // The preview can leave the old entity in place until its next refresh.
    if (!flow || !tapTargetCell(flow, owner.cell)) return;
    if (!context.debounce.press(playerId, system.currentTick)) return;
    const intent = blockPressIntent(flow, player.isSneaking);
    const command = {
      player,
      playerId,
      dimensionId: owner.dimensionId,
      cell: owner.cell,
    };
    if (defer) {
      // Claim the press before itemUse can handle the same interaction.
      system.run(() => pressBlockCell(context, command, intent));
    } else {
      pressBlockCell(context, command, intent);
    }
  };
  world.afterEvents.entityHitEntity.subscribe(
    ({ damagingEntity, hitEntity }) => {
      if (
        hitEntity.typeId === TAP_TARGET_TYPE &&
        damagingEntity.typeId === "minecraft:player"
      )
        press(damagingEntity as Player, hitEntity.id);
    },
  );
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== TAP_TARGET_TYPE) return;
    ev.cancel = true;
    press(ev.player, ev.target.id, true);
  });
  return press;
}
