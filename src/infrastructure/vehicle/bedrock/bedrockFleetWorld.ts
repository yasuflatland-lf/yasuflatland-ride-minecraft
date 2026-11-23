// Implements the fleet ports with @minecraft/server (ADR 0012, 0066).
import { ItemStack } from "@minecraft/server";
import type {
  BreakWorld,
  LimitWorld,
} from "../../../application/vehicle/ports/fleet";
import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";
import type { BedrockInventory } from "./bedrockInventory";
import { type EntityIndex, loadedVehicleEntities } from "./entityIndex";
import {
  campingGearItem,
  fleetEntryOf,
  ITEM_TYPE,
  kindOfEntity,
} from "./identifiers";
import type { VehicleReleaser } from "./vehicleReleaser";

export class BedrockFleetWorld implements LimitWorld, BreakWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly releaser: VehicleReleaser,
    private readonly inventory: Pick<BedrockInventory, "giveItems">,
  ) {}

  loadedFleetEntries(): FleetEntry[] {
    return loadedVehicleEntities()
      .map(fleetEntryOf)
      .filter((entry) => entry !== undefined);
  }

  dropVehicleItem(vehicleId: VehicleId): void {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    const kind = kindOfEntity(vehicle.typeId);
    if (kind === undefined) return;
    vehicle.dimension.spawnItem(
      new ItemStack(ITEM_TYPE[kind], 1),
      vehicle.location,
    );
  }

  giveDecorItems(playerId: PlayerId, items: readonly string[]): void {
    this.inventory.giveItems(playerId, items.map(campingGearItem));
  }

  removeVehicle(vehicleId: VehicleId): void {
    const vehicle = this.index.entity(vehicleId);
    this.releaser.release(vehicleId, vehicle);
    vehicle?.remove();
  }
}
