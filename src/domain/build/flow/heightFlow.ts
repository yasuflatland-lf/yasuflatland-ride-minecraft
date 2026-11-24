import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import { boxOf, boxWithHeight, type CellBox, sizeOf } from "../box";
import type { HeightRange } from "../heightRange";
import { isRoofKind, stairRoofHeight } from "../roof/roof";
import { selectionHeightLimit, selectionOf, withBox } from "../selection";
import { type Shape, shapeOf } from "../shape/shape";
import { stairMaterialOf } from "../stair";
import { type HeightStepKind, locksBoxHeight } from "../volume/kind";
import type { BaseHeightFlow, BuildFlow, HeightStepFlow } from "./state";

/** The height the two taps span, clamped to the selection height limit. */
export function tappedSpanHeight(box: CellBox, range: HeightRange): number {
  return Math.min(sizeOf(box).y, selectionHeightLimit(box, range));
}

export function heightStepBox(flow: HeightStepFlow): CellBox {
  return boxWithHeight(flow.base, flow.previous);
}

export function tapBlock(
  flow: BuildFlow,
  dimensionId: DimensionId,
  cell: Cell,
  material: BlockState,
  range: HeightRange,
): BuildFlow {
  if (
    flow.kind === "baseHeight" ||
    flow.kind === "selected" ||
    flow.kind === "heightStep" ||
    flow.kind === "pasteAim" ||
    flow.kind === "terrainConfirm" ||
    flow.kind === "stairAim" ||
    flow.kind === "stairContents"
  )
    return flow;
  if (flow.kind === "idle" || flow.dimensionId !== dimensionId)
    return Object.freeze({
      kind: "point1",
      dimensionId,
      cell: Object.freeze({ ...cell }),
      material,
    });
  return tapAir(flow, cell, range);
}

export function tapAir(
  flow: BuildFlow,
  end: Cell | undefined,
  range: HeightRange,
): BuildFlow {
  if (flow.kind !== "point1" || !end) return flow;
  const selection = selectionOf(
    flow.dimensionId,
    boxOf(flow.cell, end),
    flow.material,
  );
  const from = flow.cell;
  const to = Object.freeze({ ...end });
  if (shapeOf(from, to).kind === "line")
    return Object.freeze({
      kind: "selected",
      stepBackTo: flow,
      menuLevel: "root",
      selection,
      from,
      to,
    });
  return Object.freeze({
    kind: "baseHeight",
    stepBackTo: flow,
    selection,
    from,
    to,
    baseBox: boxWithHeight(selection.box, 1),
    previous: tappedSpanHeight(selection.box, range),
  });
}

export function enteredBaseHeight(
  before: BuildFlow,
  after: BuildFlow,
): boolean {
  return after.kind === "baseHeight" && before.kind !== "baseHeight";
}

export function adjustHeight(flow: BuildFlow, range: HeightRange): BuildFlow {
  if (
    flow.kind !== "selected" ||
    flow.menuLevel !== "root" ||
    shapeOf(flow.selection.box.min, flow.selection.box.max).kind === "line"
  )
    return flow;
  const box = flow.selection.box;
  return Object.freeze({
    kind: "baseHeight",
    selection: flow.selection,
    from: flow.from,
    to: flow.to,
    baseBox: boxWithHeight(box, 1),
    previous: tappedSpanHeight(box, range),
  });
}

export function liveHeightBox(flow: BaseHeightFlow): CellBox {
  return boxWithHeight(flow.baseBox, flow.previous);
}

function tappedSpanBox(flow: BaseHeightFlow, range: HeightRange): CellBox {
  const span = flow.selection.box;
  return boxWithHeight(span, tappedSpanHeight(span, range));
}

export function confirmTappedSpan(
  flow: BaseHeightFlow,
  range: HeightRange,
): Extract<BuildFlow, { kind: "selected" }> {
  return confirmBox(flow, tappedSpanBox(flow, range));
}

export function confirmLiveHeight(
  flow: BaseHeightFlow,
): Extract<BuildFlow, { kind: "selected" }> {
  return confirmBox(flow, liveHeightBox(flow));
}

function confirmBox(
  flow: BaseHeightFlow,
  box: CellBox,
): Extract<BuildFlow, { kind: "selected" }> {
  return Object.freeze({
    kind: "selected",
    menuLevel: "root",
    selection: withBox(flow.selection, box),
    from: flow.from,
    to: flow.to,
  });
}

function acceptsHeightedShape(shape: Shape): boolean {
  return shape.kind === "box" || (shape.kind === "rect" && shape.flat === "y");
}

export function chooseHeighted(
  flow: BuildFlow,
  kind: HeightStepKind,
  range: HeightRange,
): { flow: HeightStepFlow } | { refused: "tooLarge" | "shape" } {
  if (flow.kind !== "selected") return { refused: "shape" };
  const { box, dimensionId, material } = flow.selection;
  const shape = shapeOf(box.min, box.max);
  if (!acceptsHeightedShape(shape)) return { refused: "shape" };
  const locked = locksBoxHeight(kind);
  const base = boxWithHeight(box, 1);
  const stairRoof = isRoofKind(kind) && stairMaterialOf(material) !== undefined;
  const previous = stairRoof
    ? stairRoofHeight(base)
    : locked
      ? sizeOf(box).y
      : 1;
  if (stairRoof && base.min.y + previous - 1 > range.maxY)
    return { refused: "tooLarge" };
  return {
    flow: Object.freeze({
      kind: "heightStep",
      dimensionId,
      base,
      ...(stairRoof || (!locked && shape.kind === "box")
        ? { selectionBefore: box }
        : {}),
      from: flow.from,
      to: flow.to,
      heightedKind: kind,
      previous,
      heightLocked: locked || stairRoof,
      ...(stairRoof ? { roofStyle: "stair" as const } : {}),
      material,
    }),
  };
}

export function setHeight(flow: BuildFlow, height: number): BuildFlow {
  return (flow.kind === "baseHeight" && height !== flow.previous) ||
    (flow.kind === "heightStep" && !flow.heightLocked)
    ? Object.freeze({ ...flow, previous: height })
    : flow;
}
