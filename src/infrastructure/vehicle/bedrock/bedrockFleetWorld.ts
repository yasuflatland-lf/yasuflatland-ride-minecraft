// Implements the fleet ports with @minecraft/server (ADR 0012, 0066).
import { ItemStack, world } from "@minecraft/server";
import type {
  BreakWorld,
  LimitWorld,
} from "../../../application/vehicle/ports";
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";
import { DIMENSIONS, type EntityIndex } from "./entityIndex";
import {
  fleetEntryOf,
  ITEM_TYPE,
  kindOfEntity,
  VEHICLE_FAMILY,
} from "./identifiers";
import type { VehicleReleaser } from "./vehicleReleaser";

export class BedrockFleetWorld implements LimitWorld, BreakWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly releaser: VehicleReleaser,
  ) {}

  loadedFleetEntries(): FleetEntry[] {
    return DIMENSIONS.flatMap((dimId) =>
      world
        .getDimension(dimId)
        .getEntities({ families: [VEHICLE_FAMILY] })
        .map(fleetEntryOf)
        .filter((entry) => entry !== undefined),
    );
  }

  dropVehicleItem(vehicleId: string): void {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    const kind = kindOfEntity(vehicle.typeId);
    if (kind === undefined) return;
    vehicle.dimension.spawnItem(
      new ItemStack(ITEM_TYPE[kind], 1),
      vehicle.location,
    );
  }

  removeVehicle(vehicleId: string): void {
    const vehicle = this.index.entity(vehicleId);
    this.releaser.release(vehicleId, vehicle);
    vehicle?.remove();
  }
}
