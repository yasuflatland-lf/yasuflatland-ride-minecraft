import { type Cell, sameCell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import { boxOf, boxWithHeight, type CellBox, sizeOf } from "../box";
import { isRoofKind, stairRoofHeight } from "../roof/roof";
import {
  type Selection,
  selectionHeightLimit,
  selectionOf,
  withBox,
} from "../selection";
import { type Shape, shapeOf } from "../shape/shape";
import { BUILD_SPEC } from "../spec";
import { stairMaterialOf } from "../stair";
import type { StairOp } from "../stairs/contents";
import { type StairRow, stairRowOf } from "../stairs/row";
import type { Staircase } from "../stairs/staircase";
import type { TerrainOp } from "../terrain/area";
import { type HeightStepKind, locksBoxHeight } from "../volume/kind";
import type { PasteAim } from "./paste";

export type BuildFlow =
  | { readonly kind: "idle" }
  | {
      readonly kind: "point1";
      readonly dimensionId: DimensionId;
      readonly cell: Cell;
      readonly material: BlockState;
    }
  | {
      readonly kind: "baseHeight";
      readonly stepBackTo?: Point1Flow;
      readonly selection: Selection;
      readonly baseBox: CellBox;
      readonly previous: number;
      readonly from: Cell;
      readonly to: Cell;
    }
  | {
      readonly kind: "selected";
      readonly stepBackTo?: Point1Flow;
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
      readonly selectionBefore?: CellBox;
      readonly from: Cell;
      readonly heightedKind: HeightStepKind;
      readonly previous: number;
      readonly heightLocked: boolean;
      readonly roofStyle?: "stair";
      readonly material: BlockState;
    }
  | {
      readonly kind: "terrainConfirm";
      readonly selection: Selection;
      readonly from: Cell;
      readonly to: Cell;
      readonly op: TerrainOp;
    }
  | {
      readonly kind: "stairAim";
      readonly op: StairOp;
      readonly dimensionId: DimensionId;
      readonly row: StairRow;
      readonly taps: Taps;
      readonly material: BlockState;
      readonly selectionBefore: CellBox;
    }
  | {
      readonly kind: "stairContents";
      readonly op: StairOp;
      readonly dimensionId: DimensionId;
      readonly staircase: Staircase;
      readonly taps: Taps;
      readonly material: BlockState;
      readonly selectionBefore: CellBox;
    }
  | PasteAim;

/** The two tapped cells of a selection. The first tap need not be the minimum corner. */
export type Taps = Readonly<{ from: Cell; to: Cell }>;

/** Selected and terrain confirmation flows keep their taps for terrain heights and Cancel. */
export function tapsOf(flow: BuildFlow): Taps | undefined {
  if (flow.kind === "selected" || flow.kind === "terrainConfirm")
    return { from: flow.from, to: flow.to };
}

/** Uses the minimum and maximum corners as the first and second taps. */
export function cornerTaps(box: CellBox): Taps {
  return { from: box.min, to: box.max };
}

export type Point1Flow = Extract<BuildFlow, { kind: "point1" }>;

export type BaseHeightFlow = Extract<BuildFlow, { kind: "baseHeight" }>;
export type HeightStepFlow = Extract<BuildFlow, { kind: "heightStep" }>;

/** The height the two taps span, clamped to the selection height limit. */
export function tappedSpanHeight(box: CellBox): number {
  return Math.min(sizeOf(box).y, selectionHeightLimit(box));
}

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
  return tapAir(flow, cell);
}

export function tapAir(flow: BuildFlow, end?: Cell): BuildFlow {
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
    previous: tappedSpanHeight(selection.box),
  });
}

export function withoutStepBack(flow: BuildFlow): BuildFlow {
  if (
    (flow.kind !== "baseHeight" && flow.kind !== "selected") ||
    !flow.stepBackTo
  )
    return flow;
  const { stepBackTo: _, ...confirmed } = flow;
  return Object.freeze(confirmed);
}

export function enteredBaseHeight(
  before: BuildFlow,
  after: BuildFlow,
): boolean {
  return after.kind === "baseHeight" && before.kind !== "baseHeight";
}

export function adjustHeight(flow: BuildFlow): BuildFlow {
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
    previous: tappedSpanHeight(box),
  });
}

export function liveHeightBox(flow: BaseHeightFlow): CellBox {
  return boxWithHeight(flow.baseBox, flow.previous);
}

export function tappedSpanBox(flow: BaseHeightFlow): CellBox {
  const span = boxOf(flow.from, flow.to);
  return boxWithHeight(span, tappedSpanHeight(span));
}

export function confirmTappedSpan(
  flow: BaseHeightFlow,
): Extract<BuildFlow, { kind: "selected" }> {
  return confirmBox(flow, tappedSpanBox(flow));
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

export function acceptsAnyItemUse(flow: BuildFlow): boolean {
  return flow.kind === "baseHeight" || flow.kind === "selected";
}

export function opensUtilityMenu(flow: BuildFlow, sneaking: boolean): boolean {
  return sneaking || flow.kind === "idle" || flow.kind === "selected";
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
  if (flow.kind === "stairAim" || flow.kind === "stairContents")
    return Object.freeze({
      kind: "point1",
      dimensionId: flow.dimensionId,
      cell: flow.taps.from,
      material: flow.material,
    });
  return flow.kind === "terrainConfirm"
    ? Object.freeze({
        kind: "point1",
        dimensionId: flow.selection.dimensionId,
        cell: flow.from,
        material: flow.selection.material,
      })
    : flow;
}

function acceptsHeightedShape(shape: Shape): boolean {
  return shape.kind === "box" || (shape.kind === "rect" && shape.flat === "y");
}

export function stairRoofFits(
  { box, material }: Selection,
  kind: HeightStepKind,
): boolean {
  return (
    !isRoofKind(kind) ||
    !stairMaterialOf(material) ||
    !acceptsHeightedShape(shapeOf(box.min, box.max)) ||
    box.min.y + stairRoofHeight(box) - 1 <= BUILD_SPEC.worldTopY
  );
}

export function chooseHeighted(
  flow: BuildFlow,
  kind: HeightStepKind,
): BuildFlow {
  if (flow.kind !== "selected") return flow;
  const { box, dimensionId, material } = flow.selection;
  const shape = shapeOf(box.min, box.max);
  if (!acceptsHeightedShape(shape)) return flow;
  const locked = locksBoxHeight(kind);
  const base = boxWithHeight(box, 1);
  const stairRoof = isRoofKind(kind) && stairMaterialOf(material) !== undefined;
  const previous = stairRoof
    ? stairRoofHeight(base)
    : locked
      ? sizeOf(box).y
      : 1;
  if (stairRoof && !stairRoofFits(flow.selection, kind)) return flow;
  return Object.freeze({
    kind: "heightStep",
    dimensionId,
    base,
    ...(stairRoof || (!locked && shape.kind === "box")
      ? { selectionBefore: box }
      : {}),
    from: flow.from,
    heightedKind: kind,
    previous,
    heightLocked: locked || stairRoof,
    ...(stairRoof ? { roofStyle: "stair" as const } : {}),
    material,
  });
}

export function selectedStairRow(
  flow: Extract<BuildFlow, { kind: "selected" }>,
): StairRow | undefined {
  const row = stairRowOf(cornerTaps(flow.selection.box));
  if (!row) return undefined;
  if (row.along === undefined) {
    return sameCell(flow.from, row.min) && sameCell(flow.to, row.min)
      ? row
      : undefined;
  }
  // Rotate can change the row axis while preserving the original taps.
  return stairRowOf(flow)?.along ? row : undefined;
}

export function chooseStairs(flow: BuildFlow, op: StairOp): BuildFlow {
  if (flow.kind !== "selected") return flow;
  const taps = { from: flow.from, to: flow.to };
  const row = selectedStairRow(flow);
  if (!row) return flow;
  const { dimensionId, material, box } = flow.selection;
  return Object.freeze({
    kind: "stairAim",
    op,
    dimensionId,
    row,
    taps,
    material,
    selectionBefore: box,
  });
}

export function fixStairGoal(flow: BuildFlow, staircase: Staircase): BuildFlow {
  if (flow.kind !== "stairAim") return flow;
  const { dimensionId, taps, material, selectionBefore } = flow;
  return Object.freeze({
    kind: "stairContents",
    op: flow.op,
    dimensionId,
    staircase,
    taps,
    material,
    selectionBefore,
  });
}

export function chooseTerrain(flow: BuildFlow, op: TerrainOp): BuildFlow {
  if (flow.kind !== "selected") return flow;
  return Object.freeze({
    kind: "terrainConfirm",
    selection: flow.selection,
    from: flow.from,
    to: flow.to,
    op,
  });
}

export function setHeight(flow: BuildFlow, height: number): BuildFlow {
  return (flow.kind === "baseHeight" && height !== flow.previous) ||
    (flow.kind === "heightStep" && !flow.heightLocked)
    ? Object.freeze({ ...flow, previous: height })
    : flow;
}

export function selectionBoxOf(flow: BuildFlow): CellBox | undefined {
  return flow.kind === "selected" ? flow.selection.box : undefined;
}
