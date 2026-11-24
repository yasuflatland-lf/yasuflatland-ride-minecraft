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
      readonly to: Cell;
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

type Point1Flow = Extract<BuildFlow, { kind: "point1" }>;

export type BaseHeightFlow = Extract<BuildFlow, { kind: "baseHeight" }>;
export type HeightStepFlow = Extract<BuildFlow, { kind: "heightStep" }>;
