// Implements HeadlightWorld with @minecraft/server (ADR 0012).
import type { HeadlightWorld } from "../../../application/vehicle/ports/headlights";
import type { VehicleId } from "../../../domain/shared/ids";
import type { EntityIndex } from "./entityIndex";
import { HEADLIGHTS_PROPERTY } from "./identifiers";

export class BedrockHeadlightWorld implements HeadlightWorld {
  constructor(private readonly index: EntityIndex) {}

  headlightsOn(vehicleId: VehicleId): boolean | undefined {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return undefined;
    return vehicle.getProperty(HEADLIGHTS_PROPERTY) === true;
  }

  setHeadlights(vehicleId: VehicleId, on: boolean): void {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    vehicle.setProperty(HEADLIGHTS_PROPERTY, on);
    vehicle.dimension.playSound("random.click", vehicle.location);
  }
}
