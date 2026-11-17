import { system, world } from "@minecraft/server";
import type { UpdateBuildModes } from "../../../../application/build/updateBuildModes";
import { asPlayerId } from "../../../../domain/shared/ids";
import { heldBuildItem } from "../heldBuildItem";

export function registerModeTick(modes: UpdateBuildModes): void {
  system.runInterval(() => {
    modes.execute(
      world
        .getAllPlayers()
        .filter((p) => p.isValid)
        .map((player) => {
          const playerId = asPlayerId(player.id);
          return {
            playerId,
            held: heldBuildItem(player) ?? "none",
          };
        }),
    );
  }, 1);
}
