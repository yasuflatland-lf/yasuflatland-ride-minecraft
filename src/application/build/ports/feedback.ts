import type { BlockState } from "../../../domain/build/blockState";
import type { PreviewSet } from "../../../domain/build/preview/preview";
import type { Facing4 } from "../../../domain/shared/facing";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type BuildMessage =
  | "pasteChoosePosition"
  | "pasteInactive"
  | "pasteNoTarget"
  | "building"
  | "cutRestored"
  | "cutIncomplete"
  | "removing"
  | "pointSet"
  | "heightAim"
  | "endSet"
  | "aimStairGoal"
  | "noStairGoal"
  | "materialRefused"
  | "fillMaterialRefused"
  | "endCleared"
  | "startCleared"
  | "selectionCleared"
  | "noSelection"
  | "tooLarge"
  | "busy"
  | "noClipboard"
  | "noGround"
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

export type BuildMode = {
  kind: "pasteReady";
  size: { x: number; y: number; z: number };
  blockCount: number;
  degrees: Facing4;
};

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
  showSize(
    playerId: PlayerId,
    size: { x: number; y: number; z: number },
    aiming?: boolean,
  ): void;
  showMode(playerId: PlayerId, mode: BuildMode): void;
  drawPreview(
    playerId: PlayerId,
    dimensionId: DimensionId | undefined,
    set: PreviewSet,
  ): void;
}
