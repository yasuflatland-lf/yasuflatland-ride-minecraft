import type { PlayerId } from "../../../domain/shared/ids";

/** Tells a player how many more hits take an item back. */
export interface HitsLeftFeedback {
  showHitsLeft(playerId: PlayerId, hitsLeft: number): void;
}
