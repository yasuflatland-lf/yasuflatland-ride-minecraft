import type { PlayerId } from "../../../domain/shared/ids";

/** Payment for an item a player places; implemented by each feature's world adapter. */
export interface ItemPayment {
  isCreative(player: PlayerId): boolean;
  /** Takes one placing item from `slot`; false when the slot no longer holds it (ADR 0024). */
  consumeItem(player: PlayerId, slot: number): boolean;
  /** Gives one placing item back: inventory first, else dropped at the player's feet. */
  refund(player: PlayerId, slot: number): void;
}
