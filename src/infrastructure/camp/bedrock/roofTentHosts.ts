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
    // Vehicle snapshots intentionally include only players. Server test hooks
    // use a mob in the driver's seat without changing production rider rules.
    const riding = world.getEntity(riderId)?.getComponent("minecraft:riding");
    return riding?.entityRidingOn?.id === id
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
