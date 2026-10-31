import { system, world } from "@minecraft/server";
import type { ClearSelection } from "../../../../application/build/clearSelection";
import type { SetPoint } from "../../../../application/build/setPoint";
import type { TapAir } from "../../../../application/build/tapAir";
import { asDimensionId, asPlayerId } from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { SELECTION_WAND_TYPE } from "../../identifiers";

export function registerWand(
  setPoint: SetPoint,
  tapAir: TapAir,
  clear: ClearSelection,
): void {
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
      dimensionId: asDimensionId(ev.block.dimension.id),
      cell: ev.block.location,
    };
    system.run(() => {
      if (player.isValid) setPoint.execute(command);
    });
  });
  world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!source.isValid || itemStack.typeId !== SELECTION_WAND_TYPE) return;
    const cmd = { playerId: asPlayerId(source.id) };
    if (source.isSneaking) clear.execute(cmd);
    else tapAir.execute(cmd);
  });
}
