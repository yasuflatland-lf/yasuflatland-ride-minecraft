// Implements StarterWorld; consumeHeld is the one place that takes a held item.
import { ItemStack } from "@minecraft/server";
import type { StarterWorld } from "../../../application/vehicle/ports/placement";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { EntityIndex } from "./entityIndex";
import { ITEM_TYPE, STARTER_RECEIVED_PROPERTY } from "./identifiers";

export class BedrockInventory implements StarterWorld {
  constructor(private readonly index: EntityIndex) {}

  /** Takes one item from `slot` (the selected one by default), but only if it still holds `typeId`. */
  consumeHeld(playerId: string, typeId: string, slot?: number): boolean {
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

  receivedStarter(playerId: string): boolean | undefined {
    const player = this.index.player(playerId);
    if (!player) return undefined;
    return player.getDynamicProperty(STARTER_RECEIVED_PROPERTY) === true;
  }

  giveVehicleItem(playerId: string, kind: VehicleKind): void {
    const player = this.index.player(playerId);
    if (!player) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    const item = new ItemStack(ITEM_TYPE[kind], 1);
    const leftover = inv ? inv.addItem(item) : item;
    if (leftover) player.dimension.spawnItem(leftover, player.location);
  }

  markStarterReceived(playerId: string): void {
    this.index
      .player(playerId)
      ?.setDynamicProperty(STARTER_RECEIVED_PROPERTY, true);
  }
}
