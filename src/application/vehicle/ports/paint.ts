// Ports for painting a vehicle; implemented in the infrastructure layer (ADR 0012).

import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type { Paint } from "../../../domain/shared/paint";
import type { VehicleKind } from "../../../domain/vehicle/kind";

export interface PaintWorld {
  /** undefined when the vehicle no longer exists. */
  paintOf(vehicleId: VehicleId): Paint | undefined;
  /** undefined when the vehicle no longer exists or is not a vehicle. */
  kindOf(vehicleId: VehicleId): VehicleKind | undefined;
  paint(vehicleId: VehicleId, paint: Paint): void;
  consumeDye(playerId: PlayerId, paint: Paint): void;
  /** Whether the player is in creative mode; false when the player is not in the world. */
  isCreative(playerId: PlayerId): boolean;
}
