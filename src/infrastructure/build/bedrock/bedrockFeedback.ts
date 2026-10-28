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

export class BedrockFeedback implements BuildFeedback {
  showMessage(playerId: PlayerId, message: BuildMessage, count?: number): void {
    const player = playerById(playerId);
    if (!player?.isValid) return;
    player.onScreenDisplay.setActionBar({
      translate: BUILD_MESSAGE[message],
      with: count === undefined ? [] : [String(count)],
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
      player.spawnParticle(particle, {
        x: point.x + 0.5,
        y: point.y + 0.5,
        z: point.z + 0.5,
      });
    }
  }
}
