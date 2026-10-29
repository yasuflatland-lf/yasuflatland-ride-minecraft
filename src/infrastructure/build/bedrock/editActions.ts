import type { ClearSelection } from "../../../application/build/clearSelection";
import type { CopySelection } from "../../../application/build/copySelection";
import type { FillSelection } from "../../../application/build/fillSelection";
import type { PasteClipboard } from "../../../application/build/pasteClipboard";
import type { ReplaceInSelection } from "../../../application/build/replaceInSelection";
import type { UndoEdit } from "../../../application/build/undoEdit";
import type { Mask, Pattern } from "../../../domain/build/edit/pattern";
import type { PlayerId } from "../../../domain/shared/ids";

export interface BuildToolActions {
  fill(pattern: Pattern): void;
  replace(mask: Mask, pattern: Pattern): void;
  copy(): void;
  paste(skipAir: boolean): void;
  undo(): void;
  clearSelection(): void;
}

export function editActions(
  playerId: PlayerId,
  cases: {
    fill: FillSelection;
    replace: ReplaceInSelection;
    copy: CopySelection;
    paste: PasteClipboard;
    undo: UndoEdit;
    clear: ClearSelection;
  },
): BuildToolActions {
  return {
    fill: (pattern) => cases.fill.execute({ playerId, pattern }),
    replace: (mask, pattern) =>
      cases.replace.execute({ playerId, mask, pattern }),
    copy: () => cases.copy.execute({ playerId }),
    paste: (skipAir) => cases.paste.execute({ playerId, skipAir }),
    undo: () => cases.undo.execute({ playerId }),
    clearSelection: () => cases.clear.execute({ playerId }),
  };
}
