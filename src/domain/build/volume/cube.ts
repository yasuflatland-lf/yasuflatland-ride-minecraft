import { type Box, center, edgePoints } from "../box";
import { cellsOfShape, type ShapeStyle, shapeCount } from "../shape/shape";
import type { HeightedGeometry, HeightedSpec } from "./geometry";
import type { FillStyle } from "./kind";

const STYLES: Record<FillStyle, ShapeStyle> = {
  fill: "fill",
  hollow: "faces",
  tube: "walls",
};

function boundsOf({ base, height }: HeightedSpec): Box {
  return {
    min: base.min,
    max: { ...base.max, y: base.min.y + height - 1 },
  };
}

export const cubeGeometry: HeightedGeometry = {
  cells(spec, fill) {
    return cellsOfShape({ kind: "box", box: boundsOf(spec) }, STYLES[fill]);
  },
  count(spec, fill) {
    return shapeCount({ kind: "box", box: boundsOf(spec) }, STYLES[fill]);
  },
  maxHeight(base, worldTopY) {
    return Math.max(1, worldTopY - base.min.y + 1);
  },
  wireframe(spec, maxPoints) {
    return edgePoints(boundsOf(spec), maxPoints).map(center);
  },
};
