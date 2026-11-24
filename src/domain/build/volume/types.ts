import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { CellBox } from "../box";
import type { RoofStyle } from "../roof/roof";
import type { FillStyle, HeightedKind, HeightStepKind } from "./kind";

export interface HeightStepSpec {
  readonly base: CellBox;
  readonly kind: HeightStepKind;
  readonly height: number;
  readonly roofStyle?: RoofStyle;
}

export interface HeightedSpec extends HeightStepSpec {
  readonly kind: HeightedKind;
}

export interface HeightedVolume {
  maxHeight(base: CellBox, worldTopY: number): number;
  wireframe(spec: HeightStepSpec, maxPoints: number): Vec3[];
}

export interface HeightedPlacement {
  cells(spec: HeightedSpec, fill: FillStyle): Iterable<Cell>;
  count(spec: HeightedSpec, fill: FillStyle): number;
}
