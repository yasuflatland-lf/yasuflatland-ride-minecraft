// A press on a vehicle whose players choose their seat, or on one of its seat fillers, is
// cancelled, and the vehicle seats the player in the free seat they aim at on its next
// tick (ADR 0120). The before event gives no hit point, so the aim comes from the head
// and the view direction, which work the same on touch and PC.
import { world } from "@minecraft/server";
import type { BoardVehicle } from "../../../../application/vehicle/boardVehicle";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import { isStandInEntity } from "../identifiers";
import { vehicleOfTarget } from "../standIns";

export function registerBoarding(boardVehicle: BoardVehicle): void {
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    // standIn.ts boards from a stand-in (ADR 0116).
    if (isStandInEntity(ev.target.typeId)) return;
    const vehicle = vehicleOfTarget(ev.target);
    if (!vehicle) return;
    const { player } = ev;
    // As minecraft:rideable's crouching_skip_interact on the vehicle.
    if (player.isSneaking) return;
    // A rider's press keeps its own uses, such as the headlight switch (ADR 0020).
    if (
      player.getComponent("minecraft:riding")?.entityRidingOn?.id === vehicle.id
    )
      return;
    const head = player.getHeadLocation();
    const at = vehicle.location;
    const taken = boardVehicle.execute({
      playerId: asPlayerId(player.id),
      vehicleId: asVehicleId(vehicle.id),
      eye: { x: head.x - at.x, y: head.y - at.y, z: head.z - at.z },
      view: player.getViewDirection(),
    });
    if (taken) ev.cancel = true;
  });
}
