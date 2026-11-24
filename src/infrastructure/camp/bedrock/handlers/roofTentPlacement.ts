import { system, world } from "@minecraft/server";
import type { PlaceRoofTent } from "../../../../application/camp/placeRoofTent";
import type { VehicleHostLookup } from "../../../../application/shared/ports/vehicleHost";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { subscribeItemOnBlock } from "../../../shared/placeable";
import { ROOF_TENT_ITEM } from "../../identifiers";

export function registerRoofTentPlacement(
  place: PlaceRoofTent,
  vehicleHost: VehicleHostLookup,
): void {
  const requested = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.itemStack?.typeId !== ROOF_TENT_ITEM) return;
    const state = vehicleHost(ev.target.id);
    if (state.status !== "present" || !state.mount) return;
    const refusal = place.refusalFor(asVehicleId(ev.target.id));
    if (refusal === "roof_taken" || refusal === "host_in_use") return;
    ev.cancel = true;
    const playerId = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, playerId)) return;
    const cmd = {
      playerId,
      dimensionId: asDimensionId(ev.player.dimension.id),
      target: { entityId: asVehicleId(ev.target.id) },
      yaw: ev.player.getRotation().y,
      slot: ev.player.selectedSlotIndex,
    };
    system.run(() => place.execute(cmd));
  });
  subscribeItemOnBlock({
    kindOf: (itemId) => (itemId === ROOF_TENT_ITEM ? itemId : undefined),
    accept: (_dimension, _block, face) => face === "up",
    placements: requested,
    place: ({ player, dimension, block, yaw, slot }) =>
      place.execute({
        playerId: player,
        dimensionId: dimension,
        target: { clicked: block },
        yaw,
        slot,
      }),
  });
}
