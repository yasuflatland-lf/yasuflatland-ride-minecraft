import { world } from "@minecraft/server";
import type { GiveStarterRoofTent } from "../../../../application/camp/giveStarterRoofTent";
import { asPlayerId } from "../../../../domain/shared/ids";

export function registerRoofTentStarter(starter: GiveStarterRoofTent): void {
  // initialSpawn is true on every join, but false on respawn (ADR 0200).
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (ev.initialSpawn) starter.execute(asPlayerId(ev.player.id));
  });
}
