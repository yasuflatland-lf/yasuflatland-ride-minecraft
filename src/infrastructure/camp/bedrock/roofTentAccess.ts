import type { Entity, Player } from "@minecraft/server";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";
import { decodeHost } from "../../../domain/camp/hosted";
import { canReachEntrance } from "../../../domain/camp/roofTent/access";
import { ROOF_TENT_HOST_PROPERTY } from "../identifiers";

export function createEntranceReach(
  lookup: VehicleHostLookup,
): (tent: Entity, player: Player) => boolean {
  return (tent, player) => {
    const marker = tent.getDynamicProperty(ROOF_TENT_HOST_PROPERTY);
    if (typeof marker !== "string") return false;
    const host = decodeHost(marker);
    if (host.kind !== "vehicle") return false;
    const state = lookup(host.id);
    return (
      state.status === "present" &&
      state.mount !== undefined &&
      canReachEntrance(state.mount, state, player.location)
    );
  };
}
