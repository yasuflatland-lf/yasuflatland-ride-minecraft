import type {
  BuildFeedback,
  BuildMessage,
  OutlineStyle,
} from "../../../application/build/ports/feedback";
import { type Box, edgePoints } from "../../../domain/build/box";
import { BUILD_SPEC } from "../../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";
import { BUILD_MESSAGE } from "../identifiers";

function messageArgs(message: BuildMessage, count?: number): string[] {
  if (message === "tooLarge")
    return [String(BUILD_SPEC.maxVolume), String(BUILD_SPEC.maxCopyVolume)];
  if (count === undefined) return [];
  return [String(count)];
}

export class BedrockFeedback implements BuildFeedback {
  showMessage(playerId: PlayerId, message: BuildMessage, count?: number): void {
    const player = playerById(playerId);
    if (!player?.isValid) return;
    player.onScreenDisplay.setActionBar({
      translate: BUILD_MESSAGE[message],
      with: messageArgs(message, count),
    });
  }

  drawOutline(
    playerId: PlayerId,
    dimensionId: DimensionId,
    box: Box,
    style: OutlineStyle,
  ): void {
    const player = playerById(playerId);
    if (!player?.isValid || player.dimension.id !== dimensionId) return;
    const particle =
      style === "selection"
        ? "minecraft:villager_happy"
        : "minecraft:blue_flame_particle";
    for (const point of edgePoints(box, BUILD_SPEC.outlineMaxPoints)) {
      if (!player.isValid) return;
      try {
        player.spawnParticle(particle, {
          x: point.x + 0.5,
          y: point.y + 0.5,
          z: point.z + 0.5,
        });
      } catch {
        // The engine can throw for a point in an unloaded chunk. Skip this
        // player's outline for the tick so the other players still get theirs.
        return;
      }
    }
  }
}
