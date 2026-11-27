// Everything one player has in the build feature. Every change to the
// selection, clipboard, history, mode, or running edit goes through here.
import type { Cell } from "../shared/cells";
import type { DimensionId, PlayerId } from "../shared/ids";
import { clamp } from "../shared/vec";
import type { Ray } from "./aim/aim";
import { aimedHeight } from "./aim/height";
import type { BlockState } from "./blockState";
import type { BlockTap } from "./blockTap";
import { boxWithHeight, type CellBox } from "./box";
import { type Clipboard, structureOf } from "./clipboard/clipboard";
import type { EditKind, EditRecord } from "./edit/change";
import { isFillMaterial } from "./edit/guard";
import {
  adjustHeight,
  chooseHeighted,
  confirmLiveHeight,
  confirmTappedSpan,
  enteredBaseHeight,
  setHeight,
  tapAir,
  tapBlock,
} from "./flow/heightFlow";
import { closeBuildMenu, openBuildMenu, shapeMenu } from "./flow/menu";
import { beginPasteAim, followFacing, rotatePasteAim } from "./flow/paste";
import { chooseStairs, fixStairGoal } from "./flow/stairFlow";
import { type BuildFlow, type BuildStart, startOf } from "./flow/state";
import {
  backToAiming,
  cancel,
  stepBackSelection,
  withoutStepBack,
} from "./flow/stepBack";
import { classifyTap, isDeliberate } from "./flow/tapConfirm";
import { type Taps, tapsForBox } from "./flow/taps";
import { chooseTerrain } from "./flow/terrainFlow";
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
import {
  inDimension,
  type Selection,
  selectionHeightLimit,
  withBox,
} from "./selection";
import { BUILD_SPEC } from "./spec";
import type { StairOp } from "./stairs/contents";
import { staircaseToward } from "./stairs/staircase";
import type { StructureHandle } from "./structure/handle";
import {
  fitsTerrainLimit,
  type TerrainOp,
  terrainAreaOf,
} from "./terrain/area";
import type { HeightStepKind } from "./volume/kind";

function selectionStart(
  flow: BuildFlow,
  selection: Selection,
  taps: Taps,
): BuildStart {
  const start = startOf(flow);
  const { dimensionId, material } = selection;
  const cell = taps.from;
  return start?.cell === cell &&
    start.dimensionId === dimensionId &&
    start.material === material
    ? start
    : Object.freeze({ dimensionId, cell, material });
}

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
  private setFlow(flow: BuildFlow): void {
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

  setFlowForTest(flow: BuildFlow): void {
    this.setFlow(flow);
  }

  tapBlock(
    dimensionId: DimensionId,
    cell: Cell,
    material: BlockState,
    range: HeightRange,
  ): BuildFlow {
    const flow = this.currentFlow;
    const next = tapBlock(flow, dimensionId, cell, material, range);
    if (next !== flow && next.kind === "point1")
      this.currentConfirmedBox = undefined;
    this.setFlow(next);
    return next;
  }

  tapAir(end: Cell, range: HeightRange): BuildFlow | undefined {
    const next = tapAir(this.currentFlow, end, range);
    if (next === this.currentFlow) return undefined;
    this.setFlow(next);
    return next;
  }

  confirmLiveHeight(): boolean {
    if (this.currentFlow.kind !== "baseHeight") return false;
    this.setFlow(confirmLiveHeight(this.currentFlow));
    return true;
  }

  aimHeight(ray: Ray, range: HeightRange): boolean {
    const flow = this.currentFlow;
    if (
      flow.kind === "baseHeight" ||
      (flow.kind === "heightStep" && !flow.heightLocked)
    ) {
      this.setFlow(setHeight(flow, aimedHeight(flow, ray, range)));
      return true;
    }
    return false;
  }

  setHeight(height: number): boolean {
    if (
      this.currentFlow.kind === "heightStep" &&
      !this.currentFlow.heightLocked
    ) {
      this.setFlow(setHeight(this.currentFlow, height));
      return true;
    }
    return false;
  }

  adjustHeight(range: HeightRange): boolean {
    const flow = this.currentFlow;
    const next = adjustHeight(flow, range);
    this.setFlow(next);
    return enteredBaseHeight(flow, next);
  }

  openSelectionMenu() {
    const flow = this.currentFlow;
    if (flow.kind !== "selected" || flow.menuLevel !== "root") return [];
    this.setFlow(withoutStepBack(flow));
    return shapeMenu(flow);
  }

  openBuildMenu(): boolean {
    const flow = this.currentFlow;
    const next = openBuildMenu(flow);
    this.setFlow(next);
    return next !== flow;
  }

  closeBuildMenu(): boolean {
    const flow = this.currentFlow;
    const next = closeBuildMenu(flow);
    this.setFlow(next);
    return next !== flow;
  }

  chooseHeighted(kind: HeightStepKind, range: HeightRange) {
    const result = chooseHeighted(this.currentFlow, kind, range);
    if ("refused" in result) {
      if (result.refused === "shape") this.setFlow(this.currentFlow);
      return result;
    }
    this.setFlow(result.flow);
    return { material: result.flow.start.material };
  }

  chooseStairs(op: StairOp): "noSelection" | "fillMaterialRefused" | undefined {
    const next = chooseStairs(this.currentFlow, op);
    if (next === this.currentFlow || next.kind !== "stairAim")
      return "noSelection";
    if (op === "stairs" && !isFillMaterial(next.start.material))
      return "fillMaterialRefused";
    this.setFlow(next);
  }

  tapStairGoal(
    tap: BlockTap,
    quietTicks: number,
  ): "set" | "confirm" | "ignored" | "noGoal" {
    const flow = this.currentFlow;
    if (flow.kind !== "stairAim") return "ignored";
    switch (classifyTap(flow.goalTap, tap, quietTicks)) {
      case "ignore":
        return "ignored";
      case "confirm":
        return this.confirmStairGoal(quietTicks);
      case "set":
        if (
          tap.dimensionId !== flow.start.dimensionId ||
          !staircaseToward(flow.row, tap.cell)
        )
          return "noGoal";
        this.setFlow(Object.freeze({ ...flow, goalTap: tap }));
        return "set";
    }
  }

  confirmStairGoal(quietTicks: number): "confirm" | "ignored" | "noGoal" {
    const flow = this.currentFlow;
    if (flow.kind !== "stairAim") return "ignored";
    if (!flow.goalTap) return "noGoal";
    if (!isDeliberate(quietTicks)) return "ignored";
    const staircase = staircaseToward(flow.row, flow.goalTap.cell);
    if (!staircase) return "noGoal";
    this.setFlow(fixStairGoal(flow, staircase));
    return "confirm";
  }

  chooseTerrain(op: TerrainOp) {
    const flow = this.currentFlow;
    if (flow.kind !== "selected") return { refused: "noSelection" } as const;
    if (op === "fillBelow" && !isFillMaterial(flow.selection.material))
      return { refused: "fillMaterialRefused" } as const;
    const area = terrainAreaOf(
      flow.selection.box,
      flow.taps.from,
      flow.taps.to,
    );
    if (!fitsTerrainLimit(area))
      return {
        refused: "tooLarge",
        area,
        dimensionId: flow.selection.dimensionId,
      } as const;
    this.setFlow(chooseTerrain(flow, op));
  }

  backToAiming(): boolean {
    const flow = this.currentFlow;
    const next = backToAiming(flow);
    this.setFlow(next);
    return next !== flow;
  }

  stepBack() {
    const step = stepBackSelection(this.currentFlow);
    if (!step) return undefined;
    this.setFlow(step.flow);
    return step.cleared;
  }

  confirmSpanForRotation(range: HeightRange): void {
    if (this.currentFlow.kind === "baseHeight")
      this.setFlow(confirmTappedSpan(this.currentFlow, range));
  }

  retainRotatedSelection(box: CellBox, range: HeightRange): void {
    const flow = this.currentFlow;
    if (flow.kind !== "selected") return;
    this.setFlow(withoutStepBack(flow));
    this.replaceSelection(
      withBox(flow.selection, box),
      tapsForBox(box, flow.taps),
      range,
    );
  }

  replaceSelection(selection: Selection, taps: Taps, range: HeightRange): void {
    const flow = this.currentFlow;
    if (flow.kind === "baseHeight") {
      this.currentFlow = Object.freeze({
        kind: "baseHeight",
        selection,
        start: selectionStart(flow, selection, taps),
        taps,
        baseBox: boxWithHeight(selection.box, 1),
        liveHeight: clamp(
          flow.liveHeight,
          1,
          selectionHeightLimit(selection.box, range),
        ),
      });
    } else if (flow.kind === "selected") {
      this.currentFlow = Object.freeze({
        ...flow,
        selection,
        start: selectionStart(flow, selection, taps),
        taps,
      });
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
            start: selectionStart(this.currentFlow, selection, taps),
            taps,
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

  startNewCopy(): boolean {
    if (this.currentFlow.kind !== "pasteAim") return false;
    this.clearSelection();
    return true;
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
