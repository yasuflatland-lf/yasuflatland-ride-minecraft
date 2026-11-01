import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import type { Box } from "../box";
import { isRoofKind } from "../roof/roof";
import { shapeOf } from "../shape/shape";
import type { HeightedKind } from "../volume/kind";

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
      readonly heightedKind: HeightedKind;
      readonly previous: number;
      readonly heightLocked: boolean;
      readonly material: BlockState;
    }
  | { readonly kind: "pasteAim"; readonly skipAir: boolean };

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

export function chooseHeighted(flow: BuildFlow, kind: HeightedKind): BuildFlow {
  if (flow.kind !== "endpoint") return flow;
  if (!isRoofKind(kind)) return flow;
  const shape = shapeOf(flow.from, flow.to);
  if (shape.kind !== "rect" || shape.flat !== "y") return flow;
  return Object.freeze({
    kind: "heightStep",
    dimensionId: flow.dimensionId,
    base: shape.box,
    from: flow.from,
    heightedKind: kind,
    previous: 1,
    heightLocked: false,
    material: flow.material,
  });
}
export function setHeight(flow: BuildFlow, height: number): BuildFlow {
  return flow.kind === "heightStep"
    ? Object.freeze({ ...flow, previous: height })
    : flow;
}
export function finishHeightStep(flow: BuildFlow, _hollow: boolean): BuildFlow {
  return flow.kind === "heightStep" ? cancel(flow) : flow;
}
export function startPaste(flow: BuildFlow, skipAir: boolean): BuildFlow {
  return flow.kind === "idle"
    ? Object.freeze({ kind: "pasteAim", skipAir })
    : flow;
}
