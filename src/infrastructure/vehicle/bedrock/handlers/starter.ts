import { world } from "@minecraft/server";
import type { GiveStarterVehicle } from "../../../../application/vehicle/giveStarterVehicle";
import { asPlayerId } from "../../../../domain/shared/ids";

export function registerStarter(starter: GiveStarterVehicle): void {
  // initialSpawn is true on every join, not only the first one, so a player
  // dynamic property records who already received the item (ADR 0023).
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (ev.initialSpawn) starter.execute(asPlayerId(ev.player.id));
  });
}
