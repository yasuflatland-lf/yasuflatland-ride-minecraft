import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
// Ports for sleeping in a parked vehicle's bed; implemented in the infrastructure layer (ADR 0012).

export interface BedWorld {
  /** The time of day, 0 to 23999. */
  timeOfDay(): number;
  setSpawnPoint(playerId: PlayerId, dimensionId: DimensionId, cell: Vec3): void;
  /** Fades the player's screen and sets the time of day to SLEEP.wakeTime once it is black. */
  sleep(playerId: PlayerId): void;
  /** Shows the lang key yasu_ride.message.<name> on a player's action bar; does nothing for a missing player. */
  showMessage(playerId: PlayerId, name: string): void;
}
