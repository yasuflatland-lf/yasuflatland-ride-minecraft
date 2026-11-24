// Everything one player has in the build feature. Every change to the
// selection, clipboard, history, mode, or running edit goes through here.
import type { PlayerId } from "../shared/ids";
import { clamp } from "../shared/vec";
import { boxWithHeight } from "./box";
import { type Clipboard, structureOf } from "./clipboard/clipboard";
import type { EditKind, EditRecord } from "./edit/change";
import { beginPasteAim, followFacing, rotatePasteAim } from "./flow/paste";
import type { BuildFlow } from "./flow/state";
import { cancel } from "./flow/stepBack";
import type { Taps } from "./flow/taps";
import type { HeightRange } from "./heightRange";
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
import { effectiveTurn, type Facing } from "./rotation/facing";
import { NO_TURN, type QuarterTurn } from "./rotation/quarterTurn";
import { inDimension, type Selection, selectionHeightLimit } from "./selection";
import { BUILD_SPEC } from "./spec";
import type { StructureHandle } from "./structure/handle";

type EditRefusal =
  | "noSelection"
  | "tooLarge"
  | "busy"
  | "noClipboard"
  | "noGround"
  | "nothingToUndo";

/** Tells a refusal from a CellBox or an EditRecord. */
export function isEditRefusal(value: unknown): value is EditRefusal {
  return typeof value === "string";
}

export class BuildSession {
  private currentFlow: BuildFlow = { kind: "idle" };
  private currentConfirmedBox: Selection | undefined;
  private currentClipboard: Clipboard | undefined;
  private currentMode: BuildMode = MODE_OFF;
  private history: UndoHistory = EMPTY_HISTORY;
  private readonly released = new Set<StructureHandle>();
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
  get confirmedBox(): Selection | undefined {
    return this.currentConfirmedBox;
  }
  get hasHistory(): boolean {
    return this.history.entries.length > 0;
  }
  setFlow(flow: BuildFlow): void {
    this.currentFlow = flow;
    // Two fast taps can fix the selection base before the wand enter delay expires.
    if (
      (flow.kind === "baseHeight" ||
        flow.kind === "selected" ||
        flow.kind === "stairAim" ||
        flow.kind === "stairContents") &&
      !this.currentMode.active
    )
      this.currentMode = { active: true, streak: 0 };
  }
  replaceSelection(selection: Selection, taps: Taps, range: HeightRange): void {
    const flow = this.currentFlow;
    if (flow.kind === "baseHeight") {
      this.currentFlow = Object.freeze({
        kind: "baseHeight",
        selection,
        ...taps,
        baseBox: boxWithHeight(selection.box, 1),
        previous: clamp(
          flow.previous,
          1,
          selectionHeightLimit(selection.box, range),
        ),
      });
    } else if (flow.kind === "selected") {
      this.currentFlow = Object.freeze({ ...flow, ...taps, selection });
    } else return;
    if (
      this.currentConfirmedBox &&
      inDimension(this.currentConfirmedBox, selection.dimensionId)
    )
      this.currentConfirmedBox = selection;
  }
  confirmBox(selection: Selection): void;
  confirmBox(selection: Selection, next: "selected", taps: Taps): void;
  confirmBox(selection: Selection, _next?: "selected", taps?: Taps): void {
    this.currentConfirmedBox = selection;
    this.setFlow(
      taps
        ? Object.freeze({
            kind: "selected",
            menuLevel: "root",
            selection,
            from: taps.from,
            to: taps.to,
          })
        : cancel(this.currentFlow),
    );
  }

  selectPasted(selection: Selection): void {
    this.confirmBox(selection, "selected", {
      from: selection.box.min,
      to: selection.box.max,
    });
  }

  completeCopy(selection: Selection, clipboard: Clipboard): void {
    const previous = structureOf(this.currentClipboard);
    this.currentClipboard = clipboard;
    if (previous !== undefined && previous !== structureOf(clipboard))
      this.released.add(previous);
    this.confirmBox(selection);
    this.currentFlow = beginPasteAim();
  }

  resumePasteAim(): boolean {
    if (
      !this.currentClipboard ||
      (this.currentFlow.kind !== "idle" && this.currentFlow.kind !== "selected")
    )
      return false;
    this.currentFlow = beginPasteAim();
    return true;
  }

  followPasteFacing(facing: Facing): void {
    if (this.currentFlow.kind !== "pasteAim") return;
    this.currentFlow = followFacing(this.currentFlow, facing);
  }

  rotatePaste(): boolean {
    if (this.currentFlow.kind !== "pasteAim") return false;
    this.currentFlow = rotatePasteAim(this.currentFlow);
    return true;
  }

  get pasteTurn(): QuarterTurn {
    return this.currentClipboard && this.currentFlow.kind === "pasteAim"
      ? effectiveTurn(
          this.currentClipboard.facing,
          this.currentFlow.facing ?? this.currentClipboard.facing,
          this.currentFlow.manualTurn,
        )
      : NO_TURN;
  }

  startNewCopy(): void {
    this.clearSelection();
  }

  clearClipboard(): void {
    const previous = structureOf(this.currentClipboard);
    this.currentClipboard = undefined;
    if (previous !== undefined) this.released.add(previous);
  }

  /** Ending paste also discards the copied selection (ADR 0203). */
  endPasting(): void {
    this.clearSelection();
    this.clearClipboard();
  }

  /** A held clipboard is discarded even when the flow is idle (ADR 0203). */
  leaveBuildMode(): void {
    if (this.currentClipboard || this.currentFlow.kind !== "idle")
      this.endPasting();
  }

  get clipboard(): Clipboard | undefined {
    return this.currentClipboard;
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

  finishEdit(record: EditRecord, kind: EditKind): void {
    this.editing = false;
    if (kind === "undoable") this.addHistory({ kind: "cells", record });
  }

  recordSnapshot(snapshot: SnapshotRecord): void {
    this.addHistory({ kind: "snapshot", snapshot });
  }

  private addHistory(entry: UndoEntry): void {
    const { history, dropped } = withEntry(
      this.history,
      entry,
      BUILD_SPEC.undoDepth,
    );
    this.history = history;
    for (const handle of dropped) this.released.add(handle);
  }

  clearHistory(): void {
    for (const entry of this.history.entries) {
      if (entry.kind === "snapshot") this.released.add(entry.snapshot.handle);
    }
    this.history = EMPTY_HISTORY;
  }

  drainReleased(): StructureHandle[] {
    if (this.released.size === 0) return [];
    // A handle can be retained again before the repository drains the update.
    const clipboard = structureOf(this.currentClipboard);
    if (clipboard !== undefined) this.released.delete(clipboard);
    for (const entry of this.history.entries) {
      if (entry.kind === "snapshot")
        this.released.delete(entry.snapshot.handle);
    }
    const handles = [...this.released];
    this.released.clear();
    return handles;
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
