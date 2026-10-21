import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
// Port for finding the room whose floor a player tapped; implemented in the infrastructure layer (ADR 0012, 0094).

export interface DockFloorWorld {
  /** The vehicle whose laid room has a floor block at this cell, if any. */
  floorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined;
}
