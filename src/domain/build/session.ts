// Everything one player has in the build feature. Every change to the
// selection, clipboard, history, mode, or running edit goes through here.
import type { DimensionId, PlayerId } from "../shared/ids";
import type { CellBox } from "./box";
import { type Clipboard, structureOf } from "./clipboard/clipboard";
import type { EditKind, EditRecord } from "./edit/change";
import { type BuildFlow, cancel } from "./flow/flow";
import { beginPasteAim } from "./flow/paste";
import {
  EMPTY_HISTORY,
  type SnapshotRecord,
  takeLast,
  type UndoEntry,
  type UndoHistory,
  withEntry,
  withPutBack,
} from "./history/history";
import { type BuildMode, MODE_OFF, type ModeInput, stepMode } from "./mode";
import { BUILD_SPEC } from "./spec";
import type { StructureHandle } from "./structure/handle";

type EditRefusal =
  | "noSelection"
  | "tooLarge"
  | "busy"
  | "noClipboard"
  | "nothingToUndo";

/** Tells a refusal from a CellBox or an EditRecord. */
export function isEditRefusal(value: unknown): value is EditRefusal {
  return typeof value === "string";
}

export class BuildSession {
  private currentFlow: BuildFlow = { kind: "idle" };
  private currentConfirmedBox:
    | { dimensionId: DimensionId; box: CellBox }
    | undefined;
  private currentClipboard: Clipboard | undefined;
  private currentMode: BuildMode = MODE_OFF;
  private history: UndoHistory = EMPTY_HISTORY;
  private editing = false;
  private undoHintTaken = false;

  constructor(readonly playerId: PlayerId) {}

  takeUndoHint(): boolean {
    if (this.undoHintTaken) return false;
    this.undoHintTaken = true;
    return true;
  }

  get flow(): BuildFlow {
    return this.currentFlow;
  }
  get confirmedBox(): { dimensionId: DimensionId; box: CellBox } | undefined {
    return this.currentConfirmedBox;
  }
  get hasHistory(): boolean {
    return this.history.entries.length > 0;
  }
  setFlow(flow: BuildFlow): void {
    this.currentFlow = flow;
  }
  confirmBox(dimensionId: DimensionId, box: CellBox): void {
    this.currentConfirmedBox = { dimensionId, box };
    this.currentFlow = cancel(this.currentFlow);
  }

  completeCopy(
    dimensionId: DimensionId,
    box: CellBox,
    clipboard: Clipboard,
  ): StructureHandle | undefined {
    const previous = structureOf(this.currentClipboard);
    this.currentClipboard = clipboard;
    this.confirmBox(dimensionId, box);
    this.currentFlow = beginPasteAim();
    return previous !== structureOf(clipboard) ? previous : undefined;
  }

  startNewCopy(): void {
    this.clearSelection();
  }

  clearClipboard(): StructureHandle | undefined {
    const previous = structureOf(this.currentClipboard);
    this.currentClipboard = undefined;
    return previous;
  }

  /** Ending paste also discards the copied selection (ADR 0203). */
  endPasting(): StructureHandle | undefined {
    this.clearSelection();
    return this.clearClipboard();
  }

  /** A held clipboard is discarded even when the flow is idle (ADR 0203). */
  leaveBuildMode(): StructureHandle | undefined {
    if (this.currentClipboard || this.currentFlow.kind !== "idle")
      return this.endPasting();
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

  /** Marks an edit as running; "busy" if one already is. */
  beginEdit(): EditRefusal | undefined {
    if (this.editing) return "busy";
    this.editing = true;
    return undefined;
  }

  /** Ends the running edit; only undoable edits add their record to history. */
  finishEdit(record: EditRecord, kind: EditKind): void {
    this.editing = false;
    if (kind !== "undoable") return;
    this.history = withEntry(
      this.history,
      { kind: "cells", record },
      BUILD_SPEC.undoDepth,
    ).history;
  }

  /** Adds the snapshot; returns the handles of older snapshots it replaced. */
  recordSnapshot(snapshot: SnapshotRecord): readonly StructureHandle[] {
    const { history, dropped } = withEntry(
      this.history,
      { kind: "snapshot", snapshot },
      BUILD_SPEC.undoDepth,
    );
    this.history = history;
    return dropped;
  }

  putBackUndo(entry: UndoEntry): void {
    this.history = withPutBack(this.history, entry);
  }

  /** The last entry, removed from the history, or a refusal ("busy" while editing). */
  takeUndo(): UndoEntry | EditRefusal {
    if (this.editing) return "busy";
    const { entry, rest } = takeLast(this.history);
    if (!entry) return "nothingToUndo";
    this.history = rest;
    return entry;
  }
}
