import type { Player } from "@minecraft/server";
import type {
  BuildFeedback,
  BuildMessage,
  OutlineStyle,
} from "../../../application/build/ports/feedback";
import { type Box, edgePoints } from "../../../domain/build/box";
import { cornerMarkerPoints } from "../../../domain/build/cornerMarker";
import { BUILD_SPEC } from "../../../domain/build/spec";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { playerById } from "../../shared/players";
import { BUILD_MESSAGE } from "../identifiers";

const CORNER_PARTICLE = "minecraft:endrod";

const OUTLINE_PARTICLE: Readonly<Record<OutlineStyle, string>> = {
  selection: "minecraft:villager_happy",
  paste: "minecraft:blue_flame_particle",
};

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
  dimensionId: DimensionId,
): Player | undefined {
  const player = playerById(playerId);
  if (!player?.isValid || player.dimension.id !== dimensionId) return undefined;
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

  drawOutline(
    playerId: PlayerId,
    dimensionId: DimensionId,
    box: Box,
    style: OutlineStyle,
  ): void {
    const player = viewerIn(playerId, dimensionId);
    if (!player) return;
    const points = edgePoints(box, BUILD_SPEC.outlineMaxPoints).map((p) => ({
      x: p.x + 0.5,
      y: p.y + 0.5,
      z: p.z + 0.5,
    }));
    this.spawnAll(player, OUTLINE_PARTICLE[style], points);
  }

  drawCorner(playerId: PlayerId, dimensionId: DimensionId, cell: Cell): void {
    const player = viewerIn(playerId, dimensionId);
    if (!player) return;
    this.spawnAll(player, CORNER_PARTICLE, cornerMarkerPoints(cell));
  }

  private spawnAll(
    player: Player,
    particle: string,
    points: readonly Vec3[],
  ): void {
    for (const point of points) {
      if (!player.isValid) return;
      try {
        player.spawnParticle(particle, point);
      } catch {
        // The engine can throw for a point in an unloaded chunk. Skip this
        // player's outline for the tick so the other players still get theirs.
        return;
      }
    }
  }
}
