// Everything one player has in the build feature. Every change to the
// selection, clipboard, history, mode, or running edit goes through here.
import type { Cell } from "../shared/cells";
import type { DimensionId, PlayerId } from "../shared/ids";
import { type Box, volume } from "./box";
import type { Clipboard } from "./clipboard/clipboard";
import type { EditRecord } from "./edit/change";
import {
  EMPTY_HISTORY,
  takeLast,
  type UndoHistory,
  withRecord,
} from "./history/history";
import { type BuildMode, MODE_OFF, type ModeInput, stepMode } from "./mode";
import type { Corner } from "./selection/corner";
import {
  type Selection,
  selectionBox,
  withCorner,
} from "./selection/selection";
import { BUILD_SPEC } from "./spec";

export type EditRefusal =
  | "noSelection"
  | "tooLarge"
  | "busy"
  | "noClipboard"
  | "nothingToUndo";

/** Tells a refusal from a Box or an EditRecord. */
export function isEditRefusal(value: unknown): value is EditRefusal {
  return typeof value === "string";
}

export class BuildSession {
  private currentSelection: Selection | undefined;
  private currentClipboard: Clipboard | undefined;
  private currentMode: BuildMode = MODE_OFF;
  private history: UndoHistory = EMPTY_HISTORY;
  private editing = false;

  constructor(readonly playerId: PlayerId) {}

  get selection(): Selection | undefined {
    return this.currentSelection;
  }

  get clipboard(): Clipboard | undefined {
    return this.currentClipboard;
  }

  get mode(): BuildMode {
    return this.currentMode;
  }

  get isInBuildMode(): boolean {
    return this.currentMode.active;
  }

  get isEditing(): boolean {
    return this.editing;
  }

  setCorner(corner: Corner, dimensionId: DimensionId, cell: Cell): Selection {
    this.currentSelection = withCorner(
      this.currentSelection,
      corner,
      dimensionId,
      cell,
    );
    return this.currentSelection;
  }

  clearSelection(): void {
    this.currentSelection = undefined;
  }

  /** Returns whether build mode turned on or off. */
  tickMode(input: ModeInput): boolean {
    const was = this.currentMode.active;
    this.currentMode = stepMode(this.currentMode, input);
    return this.currentMode.active !== was;
  }

  /** The box an edit of the selection may use, or why not. `limit` is maxVolume or maxCopyVolume. */
  editableBox(limit: number): Box | EditRefusal {
    const box = selectionBox(this.currentSelection);
    if (!box) return "noSelection";
    return volume(box) > limit ? "tooLarge" : box;
  }

  setClipboard(clipboard: Clipboard): void {
    this.currentClipboard = clipboard;
  }

  /** Marks an edit as running; "busy" if one already is. */
  beginEdit(): EditRefusal | undefined {
    if (this.editing) return "busy";
    this.editing = true;
    return undefined;
  }

  /** Ends the running edit; `record` goes to the history unless `undo` is true. */
  finishEdit(record: EditRecord, undo: boolean): void {
    this.editing = false;
    if (undo) return;
    this.history = withRecord(this.history, record, BUILD_SPEC.undoDepth);
  }

  /** The last record, removed from the history, or a refusal ("busy" while editing). */
  takeUndo(): EditRecord | EditRefusal {
    if (this.editing) return "busy";
    const { record, rest } = takeLast(this.history);
    if (!record) return "nothingToUndo";
    this.history = rest;
    return record;
  }
}
