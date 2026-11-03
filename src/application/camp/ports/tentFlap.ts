// Port for tapping a tent flap; implemented in the infrastructure layer (ADR 0012, 0132).
import type { TentFlaps } from "../../../domain/camp/flaps";
import type { FlapId, TentId } from "../../../domain/camp/tent";
import type { PlayerId } from "../../../domain/shared/ids";

export interface TentFlapWorld {
  /** The loaded tent's flaps, built on first use from its saved properties; undefined when the tent is gone or unloaded. */
  flapsOf(tentId: TentId): TentFlaps | undefined;
  /** Moves players out of the flap, or refuses without moving anyone if a mob or blocked exits prevent closing. */
  clearPlayersForClose(tentId: TentId, flap: FlapId): boolean;
  /** Tells the player that someone is in the way of the flap. */
  showFlapBlocked(playerId: PlayerId): void;
}
