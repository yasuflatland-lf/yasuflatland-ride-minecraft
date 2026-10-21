import type { VehicleId } from "../../../domain/shared/ids";
import type { DecorPlacement } from "../../../domain/vehicle/dock/decor";
// Port for saving a vehicle's decor; implemented in the infrastructure layer (ADR 0012, 0093).

export interface DecorWorld {
  /** Saves the vehicle's whole decor on its entity; does nothing for a missing vehicle. */
  saveDecor(vehicleId: VehicleId, decor: readonly DecorPlacement[]): void;
}
