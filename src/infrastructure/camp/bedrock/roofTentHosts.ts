import { world } from "@minecraft/server";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";

/** Supplements the shared lookup with positive lifecycle evidence (ADR 0125). */
export class RoofTentHosts {
  private readonly removedIds = new Set<string>();
  constructor(
    private readonly source: VehicleHostLookup,
    private readonly driverOverrides: Map<string, string>,
  ) {}

  readonly lookup: VehicleHostLookup = (id) => {
    if (this.removedIds.has(id)) return { status: "removed" };
    const state = this.source(id);
    const riderId = this.driverOverrides.get(id);
    if (state.status !== "present" || riderId === undefined) return state;
    return world.getEntity(riderId)?.isValid
      ? { ...state, driverPresent: true }
      : state;
  };
  removed(id: string): void {
    this.removedIds.add(id);
    this.driverOverrides.delete(id);
  }
  found(id: string): void {
    this.removedIds.delete(id);
  }
}
