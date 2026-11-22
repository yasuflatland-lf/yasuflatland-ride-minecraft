import { MolangVariableMap, type Player, type RGB } from "@minecraft/server";
import type {
  BuildFeedback,
  BuildMessage,
  BuildMode,
} from "../../../application/build/ports/feedback";
import type { BlockState } from "../../../domain/build/blockState";
import type { PreviewSet } from "../../../domain/build/preview/preview";
import { BUILD_SPEC } from "../../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { playerById } from "../../shared/players";
import { BUILD_MESSAGE } from "../identifiers";
import {
  MARKER_COLORS,
  MARKER_PARTICLE,
  OUTLINE_COLOR,
  OUTLINE_PARTICLE,
} from "./markerStyle";

const OUTLINE_LAYERS: ReadonlySet<keyof PreviewSet> = new Set([
  "shape",
  "roof",
  "stairs",
]);

const PREVIEW_STYLES: Readonly<Record<keyof PreviewSet, string | RGB>> = {
  startMarker: MARKER_COLORS.startMarker,
  shape: OUTLINE_COLOR,
  endMarker: MARKER_COLORS.endMarker,
  sharedMarker: MARKER_COLORS.sharedMarker,
  roof: OUTLINE_COLOR,
  stairs: OUTLINE_COLOR,
  paste: "minecraft:blue_flame_particle",
  pasteVertical: "minecraft:basic_flame_particle",
};

function messageArgs(
  message: BuildMessage,
  count?: number,
  skippedCount?: number,
): string[] {
  if (message === "undoDonePartial")
    return [String(count ?? 0), String(skippedCount ?? 0)];
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
  showUndoHint(playerId: PlayerId): void {
    const player = playerById(playerId);
    if (!player?.isValid) return;
    player.sendMessage({ translate: BUILD_MESSAGE.undoHint });
  }

  showMessage(
    playerId: PlayerId,
    message: BuildMessage,
    count?: number,
    material?: BlockState,
    skippedCount?: number,
  ): void {
    const player = playerById(playerId);
    if (!player?.isValid) return;
    player.onScreenDisplay.setActionBar({
      translate: BUILD_MESSAGE[message],
      with:
        message === "building" && material
          ? {
              rawtext: [
                {
                  translate: `tile.${material.typeId.replace(/^.*:/, "")}.name`,
                },
              ],
            }
          : messageArgs(message, count, skippedCount),
    });
  }

  showSize(
    playerId: PlayerId,
    size: { x: number; y: number; z: number },
    aiming = false,
  ): void {
    const player = playerById(playerId);
    if (!player?.isValid) return;
    player.onScreenDisplay.setActionBar({
      translate: aiming
        ? BUILD_MESSAGE.heightAimSize
        : BUILD_MESSAGE.heightSize,
      with: [String(size.x), String(size.y), String(size.z)],
    });
  }

  showMode(playerId: PlayerId, mode: BuildMode): void {
    const player = playerById(playerId);
    if (!player?.isValid) return;
    const line = {
      translate: BUILD_MESSAGE.pasteReady,
      with: [
        String(mode.size.x),
        String(mode.size.y),
        String(mode.size.z),
        String(mode.blockCount),
        String(mode.degrees),
      ],
    };
    player.onScreenDisplay.setActionBar(
      player.isSneaking
        ? {
            // The separator stays in script because lang values lose trailing spaces.
            rawtext: [
              { translate: BUILD_MESSAGE.sneakingPrefix },
              { text: " " },
              line,
            ],
          }
        : line,
    );
  }

  drawPreview(
    playerId: PlayerId,
    dimensionId: DimensionId | undefined,
    set: PreviewSet,
  ): void {
    const player = viewerIn(playerId, dimensionId);
    if (!player) return;
    for (const layer of Object.keys(PREVIEW_STYLES) as (keyof PreviewSet)[]) {
      const points = set[layer];
      if (points.length === 0) continue;
      const style = PREVIEW_STYLES[layer];
      if (typeof style === "string") {
        if (!this.spawnAll(player, style, points)) return;
      } else {
        const molang = new MolangVariableMap();
        molang.setColorRGB("variable.color", style);
        const particle = OUTLINE_LAYERS.has(layer)
          ? OUTLINE_PARTICLE
          : MARKER_PARTICLE;
        if (!this.spawnAll(player, particle, points, molang)) return;
      }
    }
  }

  private spawnAll(
    player: Player,
    particle: string,
    points: readonly Vec3[],
    molang?: MolangVariableMap,
  ): boolean {
    for (const point of points) {
      if (!player.isValid) return false;
      try {
        player.spawnParticle(particle, point, molang);
      } catch {
        // The engine can throw for a point in an unloaded chunk. Skip this
        // player's outline for the tick so the other players still get theirs.
        return false;
      }
    }
    return true;
  }
}
