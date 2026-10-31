import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import type { Box } from "../box";
import type { RoofKind } from "../roof/roof";
import { shapeOf } from "../shape/shape";

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
      readonly kind: "roofHeight";
      readonly dimensionId: DimensionId;
      readonly base: Box;
      readonly roofKind: RoofKind;
      readonly previous: number;
      readonly material: BlockState;
    }
  | { readonly kind: "pasteAim"; readonly skipAir: boolean };

export function tapBlock(
  flow: BuildFlow,
  dimensionId: DimensionId,
  cell: Cell,
  material: BlockState,
): BuildFlow {
  if (flow.kind === "roofHeight" || flow.kind === "pasteAim") return flow;
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
  return flow.kind === "endpoint"
    ? Object.freeze({
        kind: "point1",
        dimensionId: flow.dimensionId,
        cell: flow.from,
        material: flow.material,
      })
    : flow;
}

export function chooseRoof(flow: BuildFlow, kind: RoofKind): BuildFlow {
  if (flow.kind !== "endpoint") return flow;
  const shape = shapeOf(flow.from, flow.to);
  if (shape.kind !== "rect" || shape.flat !== "y") return flow;
  return Object.freeze({
    kind: "roofHeight",
    dimensionId: flow.dimensionId,
    base: shape.box,
    roofKind: kind,
    previous: 1,
    material: flow.material,
  });
}
export function setRoofHeight(flow: BuildFlow, height: number): BuildFlow {
  return flow.kind === "roofHeight"
    ? Object.freeze({ ...flow, previous: height })
    : flow;
}
export function chooseRoofFill(flow: BuildFlow, _hollow: boolean): BuildFlow {
  return flow.kind === "roofHeight" ? cancel(flow) : flow;
}
export function startPaste(flow: BuildFlow, skipAir: boolean): BuildFlow {
  return flow.kind === "idle"
    ? Object.freeze({ kind: "pasteAim", skipAir })
    : flow;
}
