import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import { boxOf, boxWithHeight, type CellBox, sizeOf } from "../box";
import type { Facing } from "../rotation/facing";
import { type Selection, selectionOf } from "../selection";
import { shapeOf } from "../shape/shape";
import type { TerrainOp } from "../terrain/area";
import { type HeightStepKind, locksBoxHeight } from "../volume/kind";
import type { PasteAim } from "./paste";
import { beginRotateMode, type RotateMode } from "./rotateMode";

export type BuildFlow =
  | { readonly kind: "idle" }
  | {
      readonly kind: "point1";
      readonly dimensionId: DimensionId;
      readonly cell: Cell;
      readonly material: BlockState;
    }
  | {
      readonly kind: "selected";
      readonly menuLevel: "root" | "build";
      readonly selection: Selection;
      // Aiming can resume from the first tap, which need not be the minimum corner.
      readonly from: Cell;
      readonly to: Cell;
    }
  | {
      readonly kind: "heightStep";
      readonly dimensionId: DimensionId;
      readonly base: CellBox;
      readonly from: Cell;
      readonly heightedKind: HeightStepKind;
      readonly facing?: Facing;
      readonly previous: number;
      readonly heightLocked: boolean;
      readonly material: BlockState;
    }
  | {
      readonly kind: "terrainConfirm";
      readonly dimensionId: DimensionId;
      readonly from: Cell;
      readonly to: Cell;
      readonly material: BlockState;
      readonly op: TerrainOp;
    }
  | PasteAim
  | RotateMode;

export type HeightStepFlow = Extract<BuildFlow, { kind: "heightStep" }>;

export function heightStepBox(flow: HeightStepFlow): CellBox {
  return boxWithHeight(flow.base, flow.previous);
}

export function tapBlock(
  flow: BuildFlow,
  dimensionId: DimensionId,
  cell: Cell,
  material: BlockState,
): BuildFlow {
  if (
    flow.kind === "selected" ||
    flow.kind === "heightStep" ||
    flow.kind === "pasteAim" ||
    flow.kind === "terrainConfirm" ||
    flow.kind === "rotateMode"
  )
    return flow;
  if (flow.kind === "idle" || flow.dimensionId !== dimensionId)
    return Object.freeze({
      kind: "point1",
      dimensionId,
      cell: Object.freeze({ ...cell }),
      material,
    });
  return tapAir(flow, cell);
}

export function tapAir(flow: BuildFlow, end?: Cell): BuildFlow {
  if (flow.kind !== "point1" || !end) return flow;
  return Object.freeze({
    kind: "selected",
    menuLevel: "root",
    selection: selectionOf(
      flow.dimensionId,
      boxOf(flow.cell, end),
      flow.material,
    ),
    from: flow.cell,
    to: Object.freeze({ ...end }),
  });
}

export function openBuildMenu(flow: BuildFlow): BuildFlow {
  return flow.kind === "selected" && flow.menuLevel === "root"
    ? Object.freeze({ ...flow, menuLevel: "build" })
    : flow;
}

export function closeBuildMenu(flow: BuildFlow): BuildFlow {
  return flow.kind === "selected" && flow.menuLevel === "build"
    ? Object.freeze({ ...flow, menuLevel: "root" })
    : flow;
}

export function opensUtilityMenu(flow: BuildFlow, sneaking: boolean): boolean {
  return (
    flow.kind !== "rotateMode" &&
    (sneaking || flow.kind === "idle" || flow.kind === "selected")
  );
}

/** True when a plain air press in this flow opens the utility menu, which offers Undo when history exists (ADR 0229). */
export function airPressOffersUndo(flow: BuildFlow): boolean {
  return flow.kind === "idle";
}

export function cancel(_flow: BuildFlow): BuildFlow {
  return Object.freeze({ kind: "idle" });
}

export function backToAiming(flow: BuildFlow): BuildFlow {
  if (flow.kind === "heightStep")
    return Object.freeze({
      kind: "point1",
      dimensionId: flow.dimensionId,
      cell: flow.from,
      material: flow.material,
    });
  return flow.kind === "terrainConfirm"
    ? Object.freeze({
        kind: "point1",
        dimensionId: flow.dimensionId,
        cell: flow.from,
        material: flow.material,
      })
    : flow;
}

export function chooseHeighted(
  flow: BuildFlow,
  kind: HeightStepKind,
  facing?: Facing,
): BuildFlow {
  if (flow.kind !== "selected") return flow;
  const { box, dimensionId, material } = flow.selection;
  const shape = shapeOf(box.min, box.max);
  const locked = shape.kind === "box" && locksBoxHeight(kind);
  if (!locked && (shape.kind !== "rect" || shape.flat !== "y")) return flow;
  return Object.freeze({
    kind: "heightStep",
    dimensionId,
    base: locked
      ? { min: shape.box.min, max: { ...shape.box.max, y: shape.box.min.y } }
      : shape.box,
    from: flow.from,
    heightedKind: kind,
    facing,
    previous: locked ? sizeOf(shape.box).y : 1,
    heightLocked: locked,
    material,
  });
}

export function chooseTerrain(flow: BuildFlow, op: TerrainOp): BuildFlow {
  if (flow.kind !== "selected") return flow;
  return Object.freeze({
    kind: "terrainConfirm",
    dimensionId: flow.selection.dimensionId,
    from: flow.from,
    to: flow.to,
    material: flow.selection.material,
    op,
  });
}

export function setHeight(flow: BuildFlow, height: number): BuildFlow {
  return flow.kind === "heightStep" && !flow.heightLocked
    ? Object.freeze({ ...flow, previous: height })
    : flow;
}
export function finishHeightStep(flow: BuildFlow, _hollow: boolean): BuildFlow {
  return flow.kind === "heightStep" ? cancel(flow) : flow;
}

export function selectionBoxOf(flow: BuildFlow): CellBox | undefined {
  return flow.kind === "rotateMode" || flow.kind === "selected"
    ? flow.selection.box
    : undefined;
}

export function clearLastPaste(flow: BuildFlow): BuildFlow {
  return flow.kind === "pasteAim"
    ? Object.freeze({
        kind: "pasteAim",
        manualTurn: flow.manualTurn,
        facing: flow.facing,
      })
    : flow;
}

export function enterRotateMode(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "selected") return flow;
  return beginRotateMode(flow.selection, 1);
}

export function finishRotateMode(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "rotateMode") return flow;
  return Object.freeze({
    kind: "selected",
    menuLevel: "root",
    selection: flow.selection,
    from: flow.selection.box.min,
    to: flow.selection.box.max,
  });
}
