import type { Vec3 } from "../../shared/vec";
import { boxWithHeight, type CellBox } from "../box";
import { cellsOfShape, type ShapeStyle, shapeCount } from "../shape/shape";
import { type Curve, line, outlinePoints } from "../wireframe";
import type {
  HeightedPlacement,
  HeightedVolume,
  HeightStepSpec,
} from "./geometry";
import type { FillStyle } from "./kind";

const STYLES: Record<FillStyle, ShapeStyle> = {
  fill: "fill",
  hollow: "faces",
  tube: "walls",
};

function boundsOf({ base, height }: HeightStepSpec): CellBox {
  return boxWithHeight(base, height);
}

export const cubePlacement: HeightedPlacement = {
  cells(spec, fill) {
    return cellsOfShape({ kind: "box", box: boundsOf(spec) }, STYLES[fill]);
  },
  count(spec, fill) {
    return shapeCount({ kind: "box", box: boundsOf(spec) }, STYLES[fill]);
  },
};

export const cubeVolume: HeightedVolume = {
  maxHeight(base, worldTopY) {
    return Math.max(1, worldTopY - base.min.y + 1);
  },
  wireframe(spec, maxPoints) {
    return boxOutline(boundsOf(spec), maxPoints);
  },
};

function boxOutline({ min, max }: CellBox, maxPoints: number): Vec3[] {
  const x0 = min.x + 0.5;
  const x1 = max.x + 0.5;
  const z0 = min.z + 0.5;
  const z1 = max.z + 0.5;
  const ys = min.y === max.y ? [min.y + 0.5] : [min.y + 0.5, max.y + 0.5];
  const horizontal: Curve[] = ys.flatMap((y) => [
    line({ x: x0, y, z: z0 }, { x: x1, y, z: z0 }),
    line({ x: x0, y, z: z1 }, { x: x1, y, z: z1 }),
    line({ x: x0, y, z: z0 }, { x: x0, y, z: z1 }),
    line({ x: x1, y, z: z0 }, { x: x1, y, z: z1 }),
  ]);
  const [yLow, yHigh] = [min.y + 0.5, max.y + 0.5];
  const vertical: Curve[] =
    min.y === max.y
      ? []
      : [
          [x0, z0],
          [x1, z0],
          [x0, z1],
          [x1, z1],
        ].map(([x, z]) =>
          line(
            { x: x as number, y: yLow, z: z as number },
            { x: x as number, y: yHigh, z: z as number },
          ),
        );
  return outlinePoints(horizontal, vertical, maxPoints);
}
