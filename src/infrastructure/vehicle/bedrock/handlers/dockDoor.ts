import { system } from "@minecraft/server";
import type { UseDockDoor } from "../../../../application/vehicle/useDockDoor";
import type { VehicleId } from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { CAMPER_DOOR_COMPONENT } from "../identifiers";

export function registerDockDoor(
  door: UseDockDoor,
  dockDoorOwner: (dimensionId: string, cell: Vec3) => VehicleId | undefined,
): void {
  // A tap on any of the 3 door cells toggles the door; the drive owns its state,
  // and the next dock re-places the door cells (ADR 0068).
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(CAMPER_DOOR_COMPONENT, {
      onPlayerInteract: (ev) => {
        const vehicleId = dockDoorOwner(ev.dimension.id, ev.block.location);
        if (vehicleId) door.execute({ vehicleId });
      },
    });
  });
}
