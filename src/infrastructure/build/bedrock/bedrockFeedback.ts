import { MolangVariableMap, type Player, type RGB } from "@minecraft/server";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../application/build/ports/feedback";
import type { MarkerEdge } from "../../../domain/build/cornerMarker";
import type { PreviewSet } from "../../../domain/build/preview/preview";
import { BUILD_SPEC } from "../../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { playerById } from "../../shared/players";
import { BUILD_MESSAGE } from "../identifiers";
import {
  MARKER_COLORS,
  MARKER_DIRECTIONS,
  MARKER_PARTICLE,
  OUTLINE_COLOR,
  OUTLINE_PARTICLE,
} from "./markerStyle";

const PREVIEW_LAYERS = [
  "startMarker",
  "shape",
  "endMarker",
  "sharedMarker",
  "roof",
  "stairs",
  "paste",
  "pasteVertical",
] as const satisfies readonly (keyof PreviewSet)[];

const OUTLINE_STYLES = {
  shape: OUTLINE_COLOR,
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

interface FeedbackListener {
  onMessage?: BuildFeedback["showMessage"];
  onMode?: BuildFeedback["showMode"];
  onUndoHint?: BuildFeedback["showUndoHint"];
}

export class BedrockFeedback implements BuildFeedback {
  readonly listeners = new Set<FeedbackListener>();

  showUndoHint(...args: Parameters<BuildFeedback["showUndoHint"]>): void {
    for (const listener of this.listeners) listener.onUndoHint?.(...args);
    const [playerId] = args;
    const player = playerById(playerId);
    if (!player?.isValid) return;
    player.sendMessage({ translate: BUILD_MESSAGE.undoHint });
  }

  showMessage(...args: Parameters<BuildFeedback["showMessage"]>): void {
    for (const listener of this.listeners) listener.onMessage?.(...args);
    const [playerId, message, count, material, skippedCount] = args;
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

  showMode(...args: Parameters<BuildFeedback["showMode"]>): void {
    for (const listener of this.listeners) listener.onMode?.(...args);
    const [playerId, mode] = args;
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
    for (const layer of PREVIEW_LAYERS) {
      if (
        layer === "startMarker" ||
        layer === "endMarker" ||
        layer === "sharedMarker"
      ) {
        if (!this.spawnMarker(player, set[layer], MARKER_COLORS[layer])) return;
        continue;
      }
      const points = set[layer];
      if (points.length === 0) continue;
      const style = OUTLINE_STYLES[layer];
      if (typeof style === "string") {
        if (!this.spawnAll(player, style, points)) return;
      } else {
        const molang = new MolangVariableMap();
        molang.setColorRGB("variable.color", style);
        if (!this.spawnAll(player, OUTLINE_PARTICLE, points, molang)) return;
      }
    }
  }

  private spawnMarker(
    player: Player,
    edges: readonly MarkerEdge[],
    color: RGB,
  ): boolean {
    for (const edge of edges) {
      if (!player.isValid) return false;
      const molang = new MolangVariableMap();
      molang.setColorRGB("variable.color", color);
      molang.setVector3("variable.direction", MARKER_DIRECTIONS[edge.axis]);
      molang.setFloat("variable.length", edge.length);
      try {
        player.spawnParticle(MARKER_PARTICLE, edge.center, molang);
      } catch {
        // Spawning into an unloaded chunk can throw.
        return false;
      }
    }
    return true;
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
