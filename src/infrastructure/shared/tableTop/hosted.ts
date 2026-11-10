import type { Entity, Player } from "@minecraft/server";

/** Places the held Gas Lantern or Dutch Oven on a chosen host; true when it took the action. */
export type PlaceHostedOnTop = (player: Player, host: Entity) => boolean;
