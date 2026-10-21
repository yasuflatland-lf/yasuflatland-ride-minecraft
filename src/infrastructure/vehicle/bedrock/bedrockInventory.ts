// Implements StarterWorld; consumeHeld is the one place that takes a held item.
import { ItemStack } from "@minecraft/server";
import type { StarterWorld } from "../../../application/vehicle/ports/placement";
import type { PlayerId } from "../../../domain/shared/ids";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { EntityIndex } from "./entityIndex";
import { ITEM_TYPE, STARTER_RECEIVED_PROPERTY } from "./identifiers";

export class BedrockInventory implements StarterWorld {
  constructor(private readonly index: EntityIndex) {}

  /** Takes one item from `slot` (the selected one by default), but only if it still holds `typeId`. */
  consumeHeld(playerId: PlayerId, typeId: string, slot?: number): boolean {
    const player = this.index.player(playerId);
    if (!player) return false;
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return false;
    const at = slot ?? player.selectedSlotIndex;
    const item = inv.getItem(at);
    if (!item || item.typeId !== typeId) return false;
    if (item.amount > 1) {
      item.amount -= 1;
      inv.setItem(at, item);
    } else {
      inv.setItem(at, undefined);
    }
    return true;
  }

  receivedStarter(playerId: PlayerId): boolean | undefined {
    const player = this.index.player(playerId);
    if (!player) return undefined;
    return player.getDynamicProperty(STARTER_RECEIVED_PROPERTY) === true;
  }

  /** Puts one of each item type into the player's inventory and drops what does not fit at the player's feet. */
  giveItems(playerId: PlayerId, typeIds: readonly string[]): void {
    const player = this.index.player(playerId);
    if (!player) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    for (const typeId of typeIds) {
      const item = new ItemStack(typeId, 1);
      const leftover = inv ? inv.addItem(item) : item;
      if (leftover) player.dimension.spawnItem(leftover, player.location);
    }
  }

  giveVehicleItem(playerId: PlayerId, kind: VehicleKind): void {
    this.giveItems(playerId, [ITEM_TYPE[kind]]);
  }

  markStarterReceived(playerId: PlayerId): void {
    this.index
      .player(playerId)
      ?.setDynamicProperty(STARTER_RECEIVED_PROPERTY, true);
  }
}
