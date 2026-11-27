import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import type { CellBox } from "../box";
import type { Selection } from "../selection";
import type { StairOp } from "../stairs/contents";
import type { StairRow } from "../stairs/row";
import type { Staircase } from "../stairs/staircase";
import type { TerrainOp } from "../terrain/area";
import type { HeightStepKind } from "../volume/kind";
import type { PasteAim } from "./paste";
import type { Taps } from "./tapCells";

export type BuildStart = Readonly<{
  dimensionId: DimensionId;
  cell: Cell;
  material: BlockState;
}>;

export type BuildFlow =
  | { readonly kind: "idle" }
  | {
      readonly kind: "point1";
      readonly start: BuildStart;
    }
  | {
      readonly kind: "baseHeight";
      readonly start: BuildStart;
      readonly freshEnd?: true;
      readonly selection: Selection;
      readonly baseBox: CellBox;
      readonly liveHeight: number;
      readonly taps: Taps;
    }
  | {
      readonly kind: "selected";
      readonly start: BuildStart;
      readonly freshEnd?: true;
      readonly rootShown?: true;
      readonly menuLevel: "root" | "build";
      readonly selection: Selection;
      readonly taps: Taps;
    }
  | {
      readonly kind: "heightStep";
      readonly start: BuildStart;
      readonly base: CellBox;
      readonly selectionBefore?: CellBox;
      readonly taps: Taps;
      readonly heightedKind: HeightStepKind;
      readonly liveHeight: number;
      readonly heightLocked: boolean;
      readonly roofStyle?: "stair";
    }
  | {
      readonly kind: "terrainConfirm";
      readonly start: BuildStart;
      readonly selection: Selection;
      readonly taps: Taps;
      readonly op: TerrainOp;
    }
  | {
      readonly kind: "stairAim";
      readonly op: StairOp;
      readonly start: BuildStart;
      readonly row: StairRow;
      readonly taps: Taps;
      readonly selectionBefore: CellBox;
    }
  | {
      readonly kind: "stairContents";
      readonly op: StairOp;
      readonly start: BuildStart;
      readonly staircase: Staircase;
      readonly taps: Taps;
      readonly selectionBefore: CellBox;
    }
  | PasteAim;

type Point1Flow = Extract<BuildFlow, { kind: "point1" }>;

export type BaseHeightFlow = Extract<BuildFlow, { kind: "baseHeight" }>;
export type HeightStepFlow = Extract<BuildFlow, { kind: "heightStep" }>;

export function startOf(flow: BuildFlow): BuildStart | undefined {
  return flow.kind === "idle" || flow.kind === "pasteAim"
    ? undefined
    : flow.start;
}

export function dimensionOf(flow: BuildFlow): DimensionId | undefined {
  return startOf(flow)?.dimensionId;
}

export function point1(start: BuildStart): Point1Flow {
  return Object.freeze({ kind: "point1", start });
}
