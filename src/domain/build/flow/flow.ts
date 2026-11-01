import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import { type Box, boxOf } from "../box";
import { shapeOf } from "../shape/shape";
import type { HeightStepKind } from "../volume/kind";
import { beginPasteAim, type PasteAim } from "./paste";

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
      readonly base: Box;
      readonly from: Cell;
      readonly heightedKind: HeightStepKind;
      readonly previous: number;
      readonly heightLocked: boolean;
      readonly material: BlockState;
    }
  | PasteAim;

export function tapBlock(
  flow: BuildFlow,
  dimensionId: DimensionId,
  cell: Cell,
  material: BlockState,
): BuildFlow {
  if (flow.kind === "heightStep" || flow.kind === "pasteAim") return flow;
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
  return flow.kind === "endpoint"
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
  const locked = shape.kind === "box" && kind === "cylinder";
  if (!locked && (shape.kind !== "rect" || shape.flat !== "y")) return flow;
  return Object.freeze({
    kind: "heightStep",
    dimensionId: flow.dimensionId,
    base: locked
      ? { min: shape.box.min, max: { ...shape.box.max, y: shape.box.min.y } }
      : shape.box,
    from: flow.from,
    heightedKind: kind,
    previous: locked ? shape.box.max.y - shape.box.min.y + 1 : 1,
    heightLocked: locked,
    material: flow.material,
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
export function startPaste(flow: BuildFlow, skipAir: boolean): BuildFlow {
  return flow.kind === "idle" ? beginPasteAim(skipAir) : flow;
}

export function copyBoxOf(flow: BuildFlow): Box | undefined {
  return flow.kind === "endpoint" ? boxOf(flow.from, flow.to) : undefined;
}
