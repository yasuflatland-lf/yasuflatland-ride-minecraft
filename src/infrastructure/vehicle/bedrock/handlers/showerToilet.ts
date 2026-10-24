import { system } from "@minecraft/server";
import type { PressShowerToilet } from "../../../../application/vehicle/pressShowerToilet";
import {
  asDimensionId,
  type DimensionId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { heldTypeId } from "../../../shared/heldItem";
import { CAMPER_SHOWER_TOILET_COMPONENT } from "../identifiers";

export function registerShowerToilet(
  showerToilet: PressShowerToilet,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
): void {
  // The doorway plate and the wall behind the open door both carry this component; the
  // camper decides from its door and the player's feet whether the door swings or the
  // shower runs. Held items never get here: gear is cancelled by the decor handler, and
  // anything else is ignored (ADR 0094, 0098, 0118).
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(
      CAMPER_SHOWER_TOILET_COMPONENT,
      {
        onPlayerInteract: (ev) => {
          const { player } = ev;
          if (!player) return;
          if (heldTypeId(player) !== undefined) return;
          const vehicleId = dockCellOwner(
            asDimensionId(ev.dimension.id),
            ev.block.location,
          );
          if (vehicleId === undefined) return;
          showerToilet.execute({ vehicleId, feet: player.location });
        },
      },
    );
  });
}
