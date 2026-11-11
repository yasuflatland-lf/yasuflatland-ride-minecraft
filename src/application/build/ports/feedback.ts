import type { BlockState } from "../../../domain/build/blockState";
import type { PreviewSet } from "../../../domain/build/preview/preview";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type BuildMessage =
  | "pasteNoTarget"
  | "building"
  | "cutRestored"
  | "cutIncomplete"
  | "removing"
  | "pointSet"
  | "endSet"
  | "materialRefused"
  | "fillMaterialRefused"
  | "selectionCleared"
  | "noSelection"
  | "tooLarge"
  | "busy"
  | "noClipboard"
  | "nothingToUndo"
  | "pasteFailed"
  | "pasteBlocked"
  | "rotateTooLarge"
  | "rotateBlocked"
  | "rotateFailed"
  | "rotateDone"
  | "copyUnreadable"
  | "copied"
  | "editDone"
  | "editDoneCount"
  | "undoFailed"
  | "undoDone"
  | "undoDonePartial";

export type BuildMode =
  | {
      kind: "pasteReady";
      size: { x: number; y: number; z: number };
      blockCount: number;
    }
  | { kind: "rotate"; degrees: 0 | 90 | 180 | 270 };

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
  showMode(playerId: PlayerId, mode: BuildMode): void;
  drawPreview(
    playerId: PlayerId,
    dimensionId: DimensionId | undefined,
    set: PreviewSet,
  ): void;
}
