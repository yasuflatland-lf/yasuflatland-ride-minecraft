import { ItemStack, world } from "@minecraft/server";
import type { GiveStarterItem } from "../../application/shared/giveStarterItem";
import type { StarterItemWorld } from "../../application/shared/ports/starterItem";
import { asPlayerId, type PlayerId } from "../../domain/shared/ids";
import { giveOrDrop, isCreative, playerById } from "./players";

export class BedrockStarterItemWorld implements StarterItemWorld {
  constructor(
    private readonly itemId: string,
    private readonly receivedProperty: string,
  ) {}

  isCreative(playerId: PlayerId): boolean {
    return isCreative(playerById(playerId));
  }

  received(playerId: PlayerId): boolean | undefined {
    const player = playerById(playerId);
    if (!player) return undefined;
    return player.getDynamicProperty(this.receivedProperty) === true;
  }

  markReceived(playerId: PlayerId): void {
    playerById(playerId)?.setDynamicProperty(this.receivedProperty, true);
  }

  give(playerId: PlayerId): void {
    const player = playerById(playerId);
    if (player) giveOrDrop(player, [new ItemStack(this.itemId, 1)]);
  }
}

export function registerStarterItem(starter: GiveStarterItem): void {
  // initialSpawn is true on every join, but false on respawn (ADR 0200).
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (ev.initialSpawn) starter.execute(asPlayerId(ev.player.id));
  });
}
