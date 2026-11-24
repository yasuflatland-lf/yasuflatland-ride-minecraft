import { system } from "@minecraft/server";
import type { RemoveDecor } from "../../../../../application/vehicle/room/removeDecor";
import { asDimensionId, asPlayerId } from "../../../../../domain/shared/ids";
import { heldTypeId } from "../../../../shared/heldItem";
import type { DockLayer } from "../../../bedrock/dockLayer";
import { componentPressPoint } from "../faceHeight";
import { CAMPER_DECOR_COMPONENT } from "../identifiers";

export function registerDecorComponent(
  remove: RemoveDecor,
  dockCellOwner: DockLayer["cellOwner"],
): void {
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(CAMPER_DECOR_COMPONENT, {
      onPlayerInteract: (ev) => {
        const player = ev.player;
        if (!player) return;
        if (heldTypeId(player) !== undefined) return;
        const vehicleId = dockCellOwner(
          asDimensionId(ev.dimension.id),
          ev.block.location,
        );
        if (vehicleId === undefined) return;
        const at = ev.block.location;
        remove.execute({
          playerId: asPlayerId(player.id),
          vehicleId,
          cell: at,
          point: componentPressPoint(ev, player.inputInfo.lastInputModeUsed),
        });
      },
    });
  });
}
