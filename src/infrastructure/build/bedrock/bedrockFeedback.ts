import type { Player } from "@minecraft/server";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../application/build/ports/feedback";
import type { PreviewSet } from "../../../domain/build/preview/preview";
import { BUILD_SPEC } from "../../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { playerById } from "../../shared/players";
import { BUILD_MESSAGE } from "../identifiers";

function messageArgs(message: BuildMessage, count?: number): string[] {
  if (message === "tooLarge")
    return [
      String(count ?? 0),
      String(BUILD_SPEC.maxVolume),
      String(BUILD_SPEC.maxCopyVolume),
    ];
  if (count === undefined) return [];
  return [String(count)];
}

function viewerIn(
  playerId: PlayerId,
  dimensionId: DimensionId | undefined,
): Player | undefined {
  const player = playerById(playerId);
  if (
    !player?.isValid ||
    (dimensionId !== undefined && player.dimension.id !== dimensionId)
  )
    return undefined;
  return player;
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

  drawPreview(
    playerId: PlayerId,
    dimensionId: DimensionId | undefined,
    set: PreviewSet,
  ): void {
    const player = viewerIn(playerId, dimensionId);
    if (!player) return;
    const styles: Record<keyof PreviewSet, string> = {
      marker: "minecraft:endrod",
      shape: "minecraft:villager_happy",
      endCube: "minecraft:endrod",
      roof: "minecraft:villager_happy",
      paste: "minecraft:blue_flame_particle",
    };
    for (const key of Object.keys(styles) as (keyof PreviewSet)[]) {
      if (!this.spawnAll(player, styles[key], set[key])) return;
    }
  }

  private spawnAll(
    player: Player,
    particle: string,
    points: readonly Vec3[],
  ): boolean {
    for (const point of points) {
      if (!player.isValid) return false;
      try {
        player.spawnParticle(particle, point);
      } catch {
        // The engine can throw for a point in an unloaded chunk. Skip this
        // player's outline for the tick so the other players still get theirs.
        return false;
      }
    }
    return true;
  }
}
