import { system, world } from "@minecraft/server";
import type { RiderGate } from "../../../../application/build/ports/rider";
import type { UpdateBuildModes } from "../../../../application/build/updateBuildModes";
import { asPlayerId } from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { BUILD_TOOL_TYPES } from "../../identifiers";

export function registerModeTick(
  modes: UpdateBuildModes,
  gate: RiderGate,
): void {
  system.runInterval(() => {
    modes.execute(
      world
        .getAllPlayers()
        .filter((p) => p.isValid)
        .map((player) => {
          const playerId = asPlayerId(player.id);
          return {
            playerId,
            riding: gate.ridesBulldozer(playerId),
            holding: BUILD_TOOL_TYPES.has(heldTypeId(player) ?? ""),
          };
        }),
    );
  }, 1);
}
