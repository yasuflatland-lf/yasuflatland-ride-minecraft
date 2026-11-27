import { type Player, system, world } from "@minecraft/server";
import { blockTapOf } from "../../../../domain/build/blockTap";
import { tapTargetCell } from "../../../../domain/build/tapTarget";
import type { Debounces } from "../../../../domain/shared/debounce";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
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
  debounce,
  ...context
}: BlockPressContext & {
  targets: Pick<BedrockTapTargets, "ownerOf">;
  debounce: Debounces<PlayerId>;
}) {
  const press = (player: Player, entityId: string, defer = false): void => {
    if (!player.isValid || heldBuildItem(player) !== "wand") return;
    const playerId = asPlayerId(player.id);
    const owner = targets.ownerOf(entityId);
    if (owner?.playerId !== playerId) return;
    const flow = context.repo.get(playerId)?.flow;
    // The preview can leave the old entity in place until its next refresh.
    if (!flow || !tapTargetCell(flow, owner.cell)) return;
    if (!debounce.press(playerId, system.currentTick)) return;
    const intent = blockPressIntent(flow, player.isSneaking);
    const command = {
      player,
      playerId,
      tap: blockTapOf(owner.dimensionId, owner.cell),
    };
    const run = () => pressBlockCell(context, command, intent);
    if (defer) {
      // Claim the press before itemUse can handle the same interaction.
      system.run(run);
    } else {
      run();
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
