import type { ClearSelection } from "../../../application/build/clearSelection";
import type { ConfirmShape } from "../../../application/build/confirmShape";
import type { CopySelection } from "../../../application/build/copySelection";
import type { PasteClipboard } from "../../../application/build/pasteClipboard";
import type { UndoEdit } from "../../../application/build/undoEdit";
import type { PlayerId } from "../../../domain/shared/ids";

export interface BuildToolActions {
  fill(): void;
  copy(): void;
  paste(skipAir: boolean): void;
  undo(): void;
  clearSelection(): void;
}

export function editActions(
  playerId: PlayerId,
  cases: {
    fill: ConfirmShape;
    copy: CopySelection;
    paste: PasteClipboard;
    undo: UndoEdit;
    clear: ClearSelection;
  },
): BuildToolActions {
  return {
    fill: () => cases.fill.execute({ playerId, style: "fill" }),
    copy: () => cases.copy.execute({ playerId }),
    paste: (skipAir) => cases.paste.execute({ playerId, skipAir }),
    undo: () => cases.undo.execute({ playerId }),
    clearSelection: () => cases.clear.execute({ playerId }),
  };
}
