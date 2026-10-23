// The vehicle's target for the shared switch router (ADR 0020, 0024, 0115, 0116).
import type { Entity, Player } from "@minecraft/server";
import type { SwitchCeilingLights } from "../../../../application/vehicle/switchCeilingLights";
import type { SwitchHeadlights } from "../../../../application/vehicle/switchHeadlights";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
  type DimensionId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { isVehicleEntity } from "../identifiers";
import { vehicleOfTarget } from "../standIns";

export function vehicleSwitchTarget(
  headlights: SwitchHeadlights,
  ceilingLights: SwitchCeilingLights,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
): SwitchTarget {
  const ridden = (player: Entity) => {
    const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
    return isVehicleEntity(mount?.typeId) ? mount : undefined;
  };
  // The room a player is in: the vehicle that laid the block under their feet, the floor or
  // whatever furniture they stand or sit on, or the cell of their feet itself. The drive then
  // checks that the feet are inside the room (ADR 0115).
  const roomOf = (player: Player): VehicleId | undefined => {
    const dimensionId = asDimensionId(player.dimension.id);
    const x = Math.floor(player.location.x);
    const y = Math.floor(player.location.y);
    const z = Math.floor(player.location.z);
    return (
      dockCellOwner(dimensionId, { x, y: y - 1, z }) ??
      dockCellOwner(dimensionId, { x, y, z })
    );
  };
  // Whether the player stands inside a room whose ceiling lights their switch reaches. Only
  // then is a press on a block or on the vehicle taken over, so a player on a boat deck, on the
  // camper roof or at its exit keeps their presses (ADR 0115).
  const inSwitchableRoom = (player: Player, room: VehicleId | undefined) =>
    room !== undefined &&
    ceilingLights.canSwitch({
      playerId: asPlayerId(player.id),
      vehicleId: room,
      feet: player.location,
    });
  // The driver of the ridden vehicle switches its headlights as before (ADR 0020). Anyone
  // else, a passenger aboard or a player on foot or on a deck seat in the room, switches
  // the ceiling lights of the room they are in (ADR 0115).
  const switchFor = (player: Player) => {
    const playerId = asPlayerId(player.id);
    const vehicle = ridden(player);
    if (vehicle) {
      const vehicleId = asVehicleId(vehicle.id);
      if (headlights.execute({ playerId, vehicleId })) return;
      ceilingLights.execute({ playerId, vehicleId, feet: player.location });
      return;
    }
    const room = roomOf(player);
    if (room !== undefined)
      ceilingLights.execute({
        playerId,
        vehicleId: room,
        feet: player.location,
      });
  };

  return {
    claimsItemUse: (player) =>
      ridden(player) !== undefined || roomOf(player) !== undefined,
    claimsEntityPress: (player, target) => {
      const vehicle = vehicleOfTarget(target);
      if (!vehicle) return false;
      // A rider aiming at their own vehicle, or a player aiming at the camper whose room they
      // stand in, interacts with it instead of using the item, so the switch is handled here too.
      const room = roomOf(player);
      return (
        ridden(player)?.id === vehicle.id ||
        (room === vehicle.id && inSwitchableRoom(player, room))
      );
    },
    // Room block presses must not also open a door or cabinet; riders keep their block presses
    // (ADR 0115).
    claimsBlockPress: (player) =>
      ridden(player) === undefined && inSwitchableRoom(player, roomOf(player)),
    switchFor,
  };
}
