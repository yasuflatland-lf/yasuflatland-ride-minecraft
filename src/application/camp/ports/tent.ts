// Port for pitching, sheltering in, and taking down the tent; implemented in the infrastructure layer (ADR 0012, 0131).
import type {
  PitchRefusal,
  PitchSurvey,
  TentId,
  TentPose,
} from "../../../domain/camp/tent";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface TentWorld {
  /** Whether the block at `at` is one of this add-on's blocks (yasu_ride:*). */
  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean;
  /** The block type at `at`; undefined when unreadable (unloaded, outside the world). */
  typeIdAt(dimensionId: DimensionId, at: Vec3): string | undefined;
  /** Reads everything planPitch needs in one batch, in this tick. */
  survey(dimensionId: DimensionId, pose: TentPose): PitchSurvey;
  isCreative(playerId: PlayerId): boolean;
  /** Takes one tent item from `slot`; false when the slot no longer holds one. */
  consumeTentItem(playerId: PlayerId, slot: number): boolean;
  /** Gives one tent item back (inventory, else dropped at the player's feet). */
  giveTentItem(playerId: PlayerId): void;
  /** Sets each cell to air without drops, in the given order. */
  clearDecorations(dimensionId: DimensionId, cells: readonly Cell[]): void;
  /** Spawns the entity at tentEntityLocation(pose) turned to pose.yaw, adds it to the registry, and lays tentCells(pose), all in this call; undefined when the spawn failed. */
  pitch(dimensionId: DimensionId, pose: TentPose): TentId | undefined;
  showPitchRefusal(playerId: PlayerId, reason: PitchRefusal): void;
  /** Whether any player's feet are insideTent; false for a tent not in the registry. */
  isOccupied(tentId: TentId): boolean;
  /** One tent item to the player (inventory, else dropped at their feet); with no player, dropped at the tent. */
  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void;
  /** Clears the tent's cells that still hold its own blocks, removes it from the registry, and removes the entity. */
  takeDown(tentId: TentId): void;
  showHitsLeft(playerId: PlayerId, hitsLeft: number): void;
  showOccupied(playerId: PlayerId): void;
}
