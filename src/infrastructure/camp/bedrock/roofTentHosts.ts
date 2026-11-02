import { world } from "@minecraft/server";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";

/** Supplements the shared lookup with positive lifecycle evidence (ADR 0125). */
export class RoofTentHosts {
  private readonly removedIds = new Set<string>();
  private readonly testDrivers = new Map<string, string>();
  constructor(private readonly source: VehicleHostLookup) {}

  readonly lookup: VehicleHostLookup = (id) => {
    if (this.removedIds.has(id)) return { status: "removed" };
    const state = this.source(id);
    const riderId = this.testDrivers.get(id);
    if (state.status !== "present" || riderId === undefined) return state;
    // Vehicle snapshots intentionally include only players, and the SUV seats
    // only players (family_types), so a test cannot seat a mob. The hook
    // registers a mob as the driver without changing production rider rules.
    return world.getEntity(riderId)?.isValid
      ? { ...state, driverPresent: true }
      : state;
  };
  removed(id: string): void {
    this.removedIds.add(id);
    this.testDrivers.delete(id);
  }
  found(id: string): void {
    this.removedIds.delete(id);
  }
  testDriver(id: string, riderId: string): void {
    this.testDrivers.set(id, riderId);
  }
}
