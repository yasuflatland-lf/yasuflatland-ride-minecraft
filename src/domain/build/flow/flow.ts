import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import { boxOf, boxWithHeight, type CellBox, sizeOf } from "../box";
import { isRoofKind, stairRoofHeight } from "../roof/roof";
import type { Facing } from "../rotation/facing";
import {
  type Selection,
  selectionHeightLimit,
  selectionOf,
  withBox,
} from "../selection";
import { type Shape, shapeOf } from "../shape/shape";
import { BUILD_SPEC } from "../spec";
import { stairMaterialOf } from "../stair";
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
      readonly selection: Selection;
      readonly baseBox: CellBox;
      readonly previous: number;
      readonly from: Cell;
      readonly to: Cell;
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
      readonly selectionBefore?: CellBox;
      readonly from: Cell;
      readonly heightedKind: HeightStepKind;
      readonly facing?: Facing;
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
      readonly dimensionId: DimensionId;
      readonly row: StairRow;
      readonly taps: Taps;
      readonly material: BlockState;
      readonly selectionBefore: CellBox;
    }
  | {
      readonly kind: "stairContents";
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

export type BaseHeightFlow = Extract<BuildFlow, { kind: "baseHeight" }>;
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
      menuLevel: "root",
      selection,
      from,
      to,
    });
  return Object.freeze({
    kind: "baseHeight",
    selection,
    from,
    to,
    baseBox: boxWithHeight(selection.box, 1),
    previous: Math.min(
      sizeOf(selection.box).y,
      selectionHeightLimit(selection.box),
    ),
  });
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
    previous: Math.min(sizeOf(box).y, selectionHeightLimit(box)),
  });
}

export function liveHeightBox(flow: BaseHeightFlow): CellBox {
  return boxWithHeight(flow.baseBox, flow.previous);
}

export function confirmLiveHeight(
  flow: BaseHeightFlow,
): Extract<BuildFlow, { kind: "selected" }> {
  return Object.freeze({
    kind: "selected",
    menuLevel: "root",
    selection: withBox(flow.selection, liveHeightBox(flow)),
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
  facing?: Facing,
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
    facing,
    previous,
    heightLocked: locked || stairRoof,
    ...(stairRoof ? { roofStyle: "stair" as const } : {}),
    material,
  });
}

export function chooseStairs(flow: BuildFlow): BuildFlow {
  if (flow.kind !== "selected") return flow;
  const taps = { from: flow.from, to: flow.to };
  const tappedRow = stairRowOf(taps);
  if (!tappedRow) return flow;
  const { dimensionId, material, box } = flow.selection;
  return Object.freeze({
    kind: "stairAim",
    dimensionId,
    // The foot follows the selection after Rotate, while Cancel needs the original tap (ADR 0254).
    row: stairRowOf(cornerTaps(box)) ?? tappedRow,
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

export function clearLastPaste(flow: BuildFlow): BuildFlow {
  return flow.kind === "pasteAim"
    ? Object.freeze({
        kind: "pasteAim",
        manualTurn: flow.manualTurn,
        facing: flow.facing,
      })
    : flow;
}
