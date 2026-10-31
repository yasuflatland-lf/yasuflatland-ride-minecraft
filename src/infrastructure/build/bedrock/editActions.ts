import type { ClearSelection } from "../../../application/build/clearSelection";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { CopySelection } from "../../../application/build/copySelection";
import type { PasteAt } from "../../../application/build/pasteAt";
import type { StartPaste } from "../../../application/build/startPaste";
import type { UndoEdit } from "../../../application/build/undoEdit";
import type { Face } from "../../../domain/build/clipboard/clipboard";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export interface BuildToolActions {
  fill(): void;
  copy(): void;
  paste(skipAir: boolean): void;
  pasteAt(dimensionId: DimensionId, block: Cell, face: Face): void;
  undo(): void;
  clearSelection(): void;
}

export function editActions(
  playerId: PlayerId,
  cases: {
    fill: ConfirmShape;
    copy: CopySelection;
    paste: StartPaste;
    pasteAt: PasteAt;
    undo: UndoEdit;
    clear: ClearSelection;
  },
): BuildToolActions {
  return {
    fill: () => cases.fill.execute({ playerId, style: "fill" }),
    copy: () => cases.copy.execute({ playerId }),
    paste: (skipAir) => cases.paste.execute({ playerId, skipAir }),
    pasteAt: (dimensionId, block, face) =>
      cases.pasteAt.execute({ playerId, dimensionId, block, face }),
    undo: () => cases.undo.execute({ playerId }),
    clearSelection: () => cases.clear.execute({ playerId }),
  };
}
