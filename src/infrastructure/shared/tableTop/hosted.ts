import type { Entity, Player } from "@minecraft/server";

/** Returns true when the held item's placement handler takes the interaction. */
export type PlaceHostedOnTop = (player: Player, host: Entity) => boolean;
