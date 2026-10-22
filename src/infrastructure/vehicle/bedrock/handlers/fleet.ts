import { EntityInitializationCause, system, world } from "@minecraft/server";
import type { LimitVehicles } from "../../../../application/vehicle/limitVehicles";
import { removeOrphanDeckSeat } from "../deckSeats";
import { fleetEntryOf } from "../identifiers";
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
    if (!ev.entity.isValid) return;
    const entry = fleetEntryOf(ev.entity);
    if (entry) limit.found([entry]);
  });
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.cause === EntityInitializationCause.Loaded) {
      removeOrphanDeckSeat(ev.entity);
      removeOrphanStandIn(ev.entity);
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
}
