import type { RoofTentId } from "../../../domain/camp/ids";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface RoofTentOccupantWorld {
  /** The single player currently inside, if any. */
  occupantOf(tentId: RoofTentId): PlayerId | undefined;
  /** Stores occupancy and toggles the adapter's occupied and flap_open state. */
  setOccupant(tentId: RoofTentId, playerId: PlayerId | undefined): void;
  /** Lays the ceiling if occupied (idempotent), or removes it if not. */
  syncCeiling(tentId: RoofTentId): void;
  /** Moves the player to the tent's interior position. */
  moveInside(playerId: PlayerId, tentId: RoofTentId): void;
  /** Hides the occupant with an idempotent, expiring timer refresh. */
  conceal(playerId: PlayerId): void;
  /** Shows the occupant again, including when outside placement is unavailable. */
  reveal(playerId: PlayerId): void;
  /** Undefined when the tent is unloaded, so missing engine state cannot imply leaving. */
  isSeated(playerId: PlayerId, tentId: RoofTentId): boolean | undefined;
  /** Places the player on ground outside the tent entrance. */
  placeOutside(playerId: PlayerId, tentId: RoofTentId): void;
  /** The respawn cell associated with this tent. */
  spawnCellOf(tentId: RoofTentId): Vec3;
  /** Every player whose spawn point this tent set, without duplicates (ADR 0231). */
  spawnSetters(tentId: RoofTentId): readonly PlayerId[];
  /** Records a player whose spawn point this tent set; a duplicate is ignored. */
  addSpawnSetter(tentId: RoofTentId, playerId: PlayerId): void;
  /** Forgets every recorded spawn setter of this tent. */
  clearSpawnSetters(tentId: RoofTentId): void;
  /** The dimension containing the tent and its spawn cell. */
  dimensionOf(tentId: RoofTentId): DimensionId;
  /** Shows the lang key yasu_ride.message.<name> on the player's action bar. */
  showMessage(playerId: PlayerId, name: string): void;
}
