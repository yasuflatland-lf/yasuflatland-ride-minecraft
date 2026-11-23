import { system } from "@minecraft/server";
import type { RemoveDecor } from "../../../../../application/vehicle/room/removeDecor";
import { asDimensionId, asPlayerId } from "../../../../../domain/shared/ids";
import { add3 } from "../../../../../domain/shared/vec";
import { heldTypeId } from "../../../../shared/heldItem";
import type { DockLayer } from "../../../bedrock/dockLayer";
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
        // The table's pair block draws two items, and the press takes
        // back the end nearest the pressed x and z (ADR 0108). Both ends stand at one
        // height, so y does not choose; and the eye is left out because this event's
        // faceLocation.y is unmeasured, while the placing event's comes inverted (ADR 0111).
        const at = ev.block.location;
        const face = ev.faceLocation;
        remove.execute({
          playerId: asPlayerId(player.id),
          vehicleId,
          cell: at,
          point: face === undefined ? undefined : add3(at, face),
        });
      },
    });
  });
}
