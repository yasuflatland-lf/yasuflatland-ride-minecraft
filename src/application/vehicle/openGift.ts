import type { PlayerId } from "../../domain/shared/ids";
// Use case: a player used a gift box, such as the camping gear box (ADR 0093).
import type { PlacementGift } from "../../domain/vehicle/placement/gift";
import type { GiftBoxWorld } from "./ports/placement";

export interface OpenGiftCommand {
  playerId: PlayerId;
  gift: PlacementGift;
  /** Hotbar slot that held the box when it was used. */
  slot: number;
}

export class OpenGift {
  constructor(private readonly world: GiftBoxWorld) {}

  /** Returns whether the box was opened. */
  execute(cmd: OpenGiftCommand): boolean {
    // Taking the box first means a second use in the same tap finds the slot
    // empty and unpacks nothing (ADR 0024).
    if (!this.world.consumeGift(cmd.playerId, cmd.gift, cmd.slot)) return false;
    this.world.unpackGift(cmd.playerId, cmd.gift);
    return true;
  }
}
