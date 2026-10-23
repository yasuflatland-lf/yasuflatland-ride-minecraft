import {
  type Dimension,
  EntityInitializationCause,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import type { LimitVehicles } from "../../../../application/vehicle/limitVehicles";
import { asVehicleId } from "../../../../domain/shared/ids";
import { removeOrphanDeckSeat } from "../deckSeats";
import { ENTITY_TYPE, fleetEntryOf, isVehicleEntity } from "../identifiers";
import { removeOrphanSeatFiller } from "../seatFillers";
import { removeOrphanStandIn } from "../standIns";

export function registerFleet(limit: LimitVehicles): void {
  // The fleet never sees a vehicle spawn while the script is not running, so it
  // reads back the loaded ones once on start. After that only events add
  // vehicles: a scan would take a vehicle summoned this tick, whose spawn event
  // has not arrived yet, for one that was already there (ADR 0038). A vehicle
  // that is no longer valid was removed by an earlier event for the same load.
  system.run(() => limit.start());
  world.afterEvents.entityLoad.subscribe((ev) => {
    removeOrphanDeckSeat(ev.entity);
    removeOrphanStandIn(ev.entity);
    removeOrphanSeatFiller(ev.entity);
    if (!ev.entity.isValid) return;
    const entry = fleetEntryOf(ev.entity);
    if (entry) limit.found([entry]);
  });
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.cause === EntityInitializationCause.Loaded) {
      removeOrphanDeckSeat(ev.entity);
      removeOrphanStandIn(ev.entity);
      removeOrphanSeatFiller(ev.entity);
    }
    if (!ev.entity.isValid) return;
    const entry = fleetEntryOf(ev.entity);
    if (!entry) return;
    if (ev.cause === EntityInitializationCause.Loaded) {
      limit.found([entry]);
    } else {
      limit.spawned(entry);
    }
  });
  world.beforeEvents.entityRemove.subscribe((ev) => {
    const vehicle = ev.removedEntity;
    if (!isVehicleEntity(vehicle.typeId)) return;
    const id = asVehicleId(vehicle.id);
    const dimension = vehicle.dimension;
    const location = { ...vehicle.location };
    // Before events are read-only. For a removal the engine raises (a kill or
    // an unload) this still runs in the removal's tick (ADR 0125).
    system.run(() => limit.removed(id, chunkLoadedAt(dimension, location)));
  });
  world.afterEvents.entityDie.subscribe(
    (ev) => limit.died(asVehicleId(ev.deadEntity.id)),
    { entityTypes: Object.values(ENTITY_TYPE) },
  );
}

// getBlock returns undefined in an unloaded chunk but can also throw
// LocationInUnloadedChunkError; both mean the chunk unloaded (ADR 0125).
function chunkLoadedAt(dimension: Dimension, location: Vector3): boolean {
  try {
    return dimension.getBlock(location) !== undefined;
  } catch {
    return false;
  }
}
