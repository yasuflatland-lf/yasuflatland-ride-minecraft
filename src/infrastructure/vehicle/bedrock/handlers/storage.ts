import { system } from "@minecraft/server";
import type { PressStorage } from "../../../../application/vehicle/pressStorage";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { heldTypeId } from "../../../shared/heldItem";
import { CAMPER_CABINET_COMPONENT } from "../identifiers";

export function registerStorage(
  press: PressStorage,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
): void {
  // Every storage unit's compartments and open doors' plates share one component. Held gear never gets
  // here: the decor handler cancels its press and places the gear (ADR 0093). Any other held
  // item is ignored, like on the shower-toilet (ADR 0098, 0114, 0121).
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(CAMPER_CABINET_COMPONENT, {
      onPlayerInteract: (ev) => {
        const { player } = ev;
        if (!player) return;
        if (heldTypeId(player) !== undefined) return;
        const at = ev.block.location;
        const vehicleId = dockCellOwner(asDimensionId(ev.dimension.id), at);
        if (vehicleId === undefined) return;
        // Both items of a compartment stand at one height, so only the pressed x and z
        // choose between them, as on a pair block (ADR 0108).
        const face = ev.faceLocation;
        press.execute({
          playerId: asPlayerId(player.id),
          vehicleId,
          cell: at,
          point:
            face === undefined
              ? undefined
              : { x: at.x + face.x, y: at.y + face.y, z: at.z + face.z },
        });
      },
    });
  });
}
