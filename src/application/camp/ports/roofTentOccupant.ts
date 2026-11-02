import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface RoofTentOccupantWorld {
  /** The single player currently inside, if any. */
  occupantOf(tentId: string): PlayerId | undefined;
  /** Stores occupancy and toggles the adapter's occupied and flap_open state. */
  setOccupant(tentId: string, playerId: PlayerId | undefined): void;
  /** Moves the player to the tent's interior position. */
  moveInside(playerId: PlayerId, tentId: string): void;
  /** Undefined when the tent is unloaded, so missing engine state cannot imply leaving. */
  isSeated(playerId: PlayerId, tentId: string): boolean | undefined;
  /** Places the player on ground outside the tent entrance. */
  placeOutside(playerId: PlayerId, tentId: string): void;
  /** The respawn cell associated with this tent. */
  spawnCellOf(tentId: string): Vec3;
  /** The player whose spawn point was last set by this tent, if any. */
  spawnSetBy(tentId: string): PlayerId | undefined;
  /** Records or forgets which player's spawn point this tent set. */
  setSpawnSetBy(tentId: string, playerId: PlayerId | undefined): void;
  /** The dimension containing the tent and its spawn cell. */
  dimensionOf(tentId: string): DimensionId;
  /** Shows the lang key yasu_ride.message.<name> on the player's action bar. */
  showMessage(playerId: PlayerId, name: string): void;
}
