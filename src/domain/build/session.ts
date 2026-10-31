// Everything one player has in the build feature. Every change to the
// selection, clipboard, history, mode, or running edit goes through here.
import type { DimensionId, PlayerId } from "../shared/ids";
import type { Box } from "./box";
import type { Clipboard } from "./clipboard/clipboard";
import type { EditRecord } from "./edit/change";
import { type BuildFlow, cancel } from "./flow/flow";
import {
  EMPTY_HISTORY,
  takeLast,
  type UndoHistory,
  withRecord,
} from "./history/history";
import { type BuildMode, MODE_OFF, type ModeInput, stepMode } from "./mode";
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
  private currentFlow: BuildFlow = { kind: "idle" };
  private currentConfirmedBox:
    | { dimensionId: DimensionId; box: Box }
    | undefined;
  private currentClipboard: Clipboard | undefined;
  private currentMode: BuildMode = MODE_OFF;
  private history: UndoHistory = EMPTY_HISTORY;
  private editing = false;

  constructor(readonly playerId: PlayerId) {}

  get flow(): BuildFlow {
    return this.currentFlow;
  }
  get confirmedBox(): { dimensionId: DimensionId; box: Box } | undefined {
    return this.currentConfirmedBox;
  }
  get hasHistory(): boolean {
    return this.history.records.length > 0;
  }
  setFlow(flow: BuildFlow): void {
    this.currentFlow = flow;
  }
  confirmBox(dimensionId: DimensionId, box: Box): void {
    this.currentConfirmedBox = { dimensionId, box };
    this.currentFlow = cancel(this.currentFlow);
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

  clearSelection(): void {
    this.currentFlow = cancel(this.currentFlow);
    this.currentConfirmedBox = undefined;
  }

  /** Returns whether build mode turned on or off. */
  tickMode(input: ModeInput): boolean {
    const was = this.currentMode.active;
    this.currentMode = stepMode(this.currentMode, input);
    return this.currentMode.active !== was;
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
