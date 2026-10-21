import { system } from "@minecraft/server";
import type { RunShower } from "../../../../application/vehicle/runShower";
import type { UseShowerDoor } from "../../../../application/vehicle/useShowerDoor";
import {
  asDimensionId,
  type DimensionId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { CAMPER_SHOWER_TOILET_COMPONENT } from "../identifiers";

export function registerShowerToilet(
  showerDoor: UseShowerDoor,
  shower: RunShower,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
): void {
  // A press from outside the shower-toilet's column swings its door; one from inside
  // runs the shower. Held items never get here: gear is cancelled by the decor
  // handler, and anything else is ignored (ADR 0094, 0098).
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(
      CAMPER_SHOWER_TOILET_COMPONENT,
      {
        onPlayerInteract: (ev) => {
          const { player } = ev;
          if (!player) return;
          const held = player
            .getComponent("minecraft:inventory")
            ?.container?.getItem(player.selectedSlotIndex);
          if (held) return;
          const cell = ev.block.location;
          const vehicleId = dockCellOwner(asDimensionId(ev.dimension.id), cell);
          if (vehicleId === undefined) return;
          const inside =
            Math.floor(player.location.x) === cell.x &&
            Math.floor(player.location.z) === cell.z;
          if (inside) shower.execute({ vehicleId });
          else showerDoor.execute({ vehicleId });
        },
      },
    );
  });
}
