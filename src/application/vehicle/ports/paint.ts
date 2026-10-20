import type { VehicleId } from "../../../domain/shared/ids";
// Ports for painting a vehicle; implemented in the infrastructure layer (ADR 0012).
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { Paint } from "../../../domain/vehicle/paint/paint";

export interface PaintWorld {
  /** undefined when the vehicle no longer exists. */
  paintOf(vehicleId: VehicleId): Paint | undefined;
  /** undefined when the vehicle no longer exists or is not a vehicle. */
  kindOf(vehicleId: VehicleId): VehicleKind | undefined;
  paint(vehicleId: VehicleId, paint: Paint): void;
  consumeDye(playerId: string, paint: Paint): void;
  /** Whether the player is in creative mode; false when the player is not in the world. */
  isCreative(playerId: string): boolean;
}
