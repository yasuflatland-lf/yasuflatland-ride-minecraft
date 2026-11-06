import type { BlockState } from "../../../domain/build/blockState";
import type { PreviewSet } from "../../../domain/build/preview/preview";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type BuildMessage =
  | "building"
  | "cutting"
  | "pointSet"
  | "endSet"
  | "materialRefused"
  | "selectionCleared"
  | "noSelection"
  | "tooLarge"
  | "busy"
  | "noClipboard"
  | "nothingToUndo"
  | "pasteBlocked"
  | "copied"
  | "editDone"
  | "editDoneCount"
  | "undoDone"
  | "undoDonePartial";

export interface BuildFeedback {
  /** Chat message so the undo gesture stays visible beyond the action bar. */
  showUndoHint(playerId: PlayerId): void;
  /** Action bar message; partial Undo shows restored `count` then `skippedCount`. */
  showMessage(
    playerId: PlayerId,
    message: BuildMessage,
    count?: number,
    material?: BlockState,
    skippedCount?: number,
  ): void;
  showSize(playerId: PlayerId, size: { x: number; y: number; z: number }): void;
  showPasteHint(
    playerId: PlayerId,
    size: { x: number; y: number; z: number },
    count: number,
  ): void;
  drawPreview(
    playerId: PlayerId,
    dimensionId: DimensionId | undefined,
    set: PreviewSet,
  ): void;
}
