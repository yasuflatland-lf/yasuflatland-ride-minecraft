import type { Box } from "../../../domain/build/box";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type BuildMessage =
  | "pos1Set"
  | "pos2Set"
  | "selectionCleared"
  | "notInBulldozer"
  | "noSelection"
  | "tooLarge"
  | "busy"
  | "noClipboard"
  | "nothingToUndo"
  | "pasteBlocked"
  | "copied"
  | "editDone"
  | "undoDone";

export type OutlineStyle = "selection" | "paste";

export interface BuildFeedback {
  /** Action bar message; `count` is shown where the message has one (volume, blocks changed). */
  showMessage(playerId: PlayerId, message: BuildMessage, count?: number): void;
  /** Particles along the edges of `box`, seen by that player only. */
  drawOutline(
    playerId: PlayerId,
    dimensionId: DimensionId,
    box: Box,
    style: OutlineStyle,
  ): void;
  /** Particles around one block cell marking a lone selection corner, seen by that player only. */
  drawCorner(playerId: PlayerId, dimensionId: DimensionId, cell: Cell): void;
}
