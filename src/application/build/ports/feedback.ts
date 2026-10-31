import type { PreviewSet } from "../../../domain/build/preview/preview";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type BuildMessage =
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
  | "undoDone";

export interface BuildFeedback {
  /** Action bar message; `count` is shown where the message has one (volume, blocks changed). */
  showMessage(playerId: PlayerId, message: BuildMessage, count?: number): void;
  drawPreview(
    playerId: PlayerId,
    dimensionId: DimensionId | undefined,
    set: PreviewSet,
  ): void;
}
