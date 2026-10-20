// Ports for painting a vehicle; implemented in the infrastructure layer (ADR 0012).
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { Paint } from "../../../domain/vehicle/paint/paint";

export interface PaintWorld {
  /** undefined when the vehicle no longer exists. */
  paintOf(vehicleId: string): Paint | undefined;
  /** undefined when the vehicle no longer exists or is not a vehicle. */
  kindOf(vehicleId: string): VehicleKind | undefined;
  paint(vehicleId: string, paint: Paint): void;
  consumeDye(playerId: string, paint: Paint): void;
  /** Whether the player is in creative mode; false when the player is not in the world. */
  isCreative(playerId: string): boolean;
}
