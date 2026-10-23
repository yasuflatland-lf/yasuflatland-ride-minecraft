// Implements StarterWorld and GiftBoxWorld for the vehicle feature.
import { ItemStack } from "@minecraft/server";
import type {
  GiftBoxWorld,
  StarterWorld,
} from "../../../application/vehicle/ports/placement";
import type { PlayerId } from "../../../domain/shared/ids";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { PlacementGift } from "../../../domain/vehicle/placement/gift";
import type { StarterKind } from "../../../domain/vehicle/placement/starter";
import { consumeHeld, giveOrDrop } from "../../shared/players";
import type { EntityIndex } from "./entityIndex";
import {
  GIFT_CONTENTS,
  GIFT_ITEM,
  GIFT_LORE,
  GIFT_RECEIVED_PROPERTY,
  ITEM_TYPE,
  STARTER_RECEIVED_PROPERTY,
} from "./identifiers";

export class BedrockInventory implements StarterWorld, GiftBoxWorld {
  constructor(private readonly index: EntityIndex) {}

  /** Takes one item from `slot` (the selected one by default), but only if it still holds `typeId`. */
  consumeHeld(playerId: PlayerId, typeId: string, slot?: number): boolean {
    const player = this.index.player(playerId);
    if (!player) return false;
    return consumeHeld(player, typeId, slot ?? player.selectedSlotIndex);
  }

  receivedStarter(playerId: PlayerId, kind: StarterKind): boolean | undefined {
    const player = this.index.player(playerId);
    if (!player) return undefined;
    return player.getDynamicProperty(STARTER_RECEIVED_PROPERTY[kind]) === true;
  }

  /** Puts one of each item type into the player's inventory and drops what does not fit at the player's feet. */
  giveItems(playerId: PlayerId, typeIds: readonly string[]): void {
    this.give(
      playerId,
      typeIds.map((typeId) => new ItemStack(typeId, 1)),
    );
  }

  giveVehicleItem(playerId: PlayerId, kind: VehicleKind): void {
    this.give(playerId, [new ItemStack(ITEM_TYPE[kind], 1)]);
  }

  markStarterReceived(playerId: PlayerId, kind: StarterKind): void {
    this.index
      .player(playerId)
      ?.setDynamicProperty(STARTER_RECEIVED_PROPERTY[kind], true);
  }

  receivedGift(playerId: PlayerId, gift: PlacementGift): boolean | undefined {
    const player = this.index.player(playerId);
    if (!player) return undefined;
    return player.getDynamicProperty(GIFT_RECEIVED_PROPERTY[gift]) === true;
  }

  giveGift(playerId: PlayerId, gift: PlacementGift): void {
    this.give(playerId, [new ItemStack(GIFT_ITEM[gift], 1)]);
  }

  markGiftReceived(playerId: PlayerId, gift: PlacementGift): void {
    this.index
      .player(playerId)
      ?.setDynamicProperty(GIFT_RECEIVED_PROPERTY[gift], true);
  }

  consumeGift(playerId: PlayerId, gift: PlacementGift, slot: number): boolean {
    return this.consumeHeld(playerId, GIFT_ITEM[gift], slot);
  }

  unpackGift(playerId: PlayerId, gift: PlacementGift): void {
    this.give(
      playerId,
      GIFT_CONTENTS[gift].map((typeId) => {
        const item = new ItemStack(typeId, 1);
        // A RawMessage lore line needs @minecraft/server 2.2.0 (manifest, ADR 0093).
        item.setLore([{ translate: GIFT_LORE[gift] }]);
        return item;
      }),
    );
  }

  private give(playerId: PlayerId, items: readonly ItemStack[]): void {
    const player = this.index.player(playerId);
    if (player) giveOrDrop(player, items);
  }
}
