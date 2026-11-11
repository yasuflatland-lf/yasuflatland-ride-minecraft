import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import { boxOf, boxWithHeight, type CellBox, sizeOf } from "../box";
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
      readonly kind: "endpoint";
      readonly dimensionId: DimensionId;
      readonly from: Cell;
      readonly to: Cell;
      readonly material: BlockState;
    }
  | {
      readonly kind: "heightStep";
      readonly dimensionId: DimensionId;
      readonly base: CellBox;
      readonly from: Cell;
      readonly heightedKind: HeightStepKind;
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
  if (flow.kind !== "point1" && flow.kind !== "endpoint") return flow;
  if (!end) return flow;
  return Object.freeze({
    kind: "endpoint",
    dimensionId: flow.dimensionId,
    from: flow.kind === "point1" ? flow.cell : flow.from,
    to: Object.freeze({ ...end }),
    material: flow.material,
  });
}

export function opensUtilityMenu(flow: BuildFlow, sneaking: boolean): boolean {
  return flow.kind !== "rotateMode" && (sneaking || flow.kind === "idle");
}

/** True when a plain air press in this flow opens a menu that offers Undo (ADR 0229, 0203). */
export function airPressOffersUndo(flow: BuildFlow): boolean {
  return opensUtilityMenu(flow, false) || flow.kind === "pasteAim";
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
  return flow.kind === "endpoint" || flow.kind === "terrainConfirm"
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
): BuildFlow {
  if (flow.kind !== "endpoint") return flow;
  const shape = shapeOf(flow.from, flow.to);
  const locked = shape.kind === "box" && locksBoxHeight(kind);
  if (!locked && (shape.kind !== "rect" || shape.flat !== "y")) return flow;
  return Object.freeze({
    kind: "heightStep",
    dimensionId: flow.dimensionId,
    base: locked
      ? { min: shape.box.min, max: { ...shape.box.max, y: shape.box.min.y } }
      : shape.box,
    from: flow.from,
    heightedKind: kind,
    previous: locked ? sizeOf(shape.box).y : 1,
    heightLocked: locked,
    material: flow.material,
  });
}

export function chooseTerrain(flow: BuildFlow, op: TerrainOp): BuildFlow {
  if (flow.kind !== "endpoint") return flow;
  return Object.freeze({
    kind: "terrainConfirm",
    dimensionId: flow.dimensionId,
    from: flow.from,
    to: flow.to,
    material: flow.material,
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
  return flow.kind === "rotateMode"
    ? flow.box
    : flow.kind === "endpoint"
      ? boxOf(flow.from, flow.to)
      : undefined;
}

export function clearLastPaste(flow: BuildFlow): BuildFlow {
  return flow.kind === "pasteAim"
    ? Object.freeze({ kind: "pasteAim", turn: flow.turn })
    : flow;
}

export function enterRotateMode(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "endpoint") return flow;
  return beginRotateMode(
    flow.dimensionId,
    boxOf(flow.from, flow.to),
    flow.material,
    1,
  );
}

export function finishRotateMode(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "rotateMode") return flow;
  return Object.freeze({
    kind: "endpoint",
    dimensionId: flow.dimensionId,
    from: flow.box.min,
    to: flow.box.max,
    material: flow.material,
  });
}
