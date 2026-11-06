import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { type Curve, ellipse, ellipseOn, outlinePoints } from "../wireframe";
import type {
  HeightedPlacement,
  HeightedSpec,
  HeightedVolume,
  HeightStepSpec,
} from "./geometry";
import type { FillStyle } from "./kind";

interface YRange {
  readonly bottom: number;
  readonly top: number;
}

type ColumnRange = (x: number, z: number) => YRange | undefined;

/**
 * Tests cells in doubled coordinates, so even sizes keep their half-cell center
 * in integers. Every sphere that fits `BUILD_SPEC.maxVolume` keeps these
 * products below 2^53, so the comparison is exact for anything actually built.
 */
function columnRangeOf({ base: { min, max }, height }: HeightStepSpec) {
  const widthSquared = (max.x - min.x + 1) ** 2;
  const depthSquared = (max.z - min.z + 1) ** 2;
  const heightSquared = height ** 2;
  const footprint = widthSquared * depthSquared;
  const sumY = 2 * min.y + height - 1;

  const columnRange: ColumnRange = (x, z) => {
    if (x < min.x || x > max.x || z < min.z || z > max.z) return undefined;
    const slack =
      footprint -
      (2 * x - min.x - max.x) ** 2 * depthSquared -
      (2 * z - min.z - max.z) ** 2 * widthSquared;
    if (slack < 0) return undefined;
    const limit = heightSquared * slack;
    // Doubled y offsets share the parity of `height - 1`.
    let reach = Math.min(height - 1, Math.floor(Math.sqrt(limit / footprint)));
    if ((reach + height) % 2 === 0) reach--;
    while (reach + 2 < height && (reach + 2) ** 2 * footprint <= limit)
      reach += 2;
    while (reach >= 0 && reach ** 2 * footprint > limit) reach -= 2;
    return reach < 0
      ? undefined
      : { bottom: (sumY - reach) / 2, top: (sumY + reach) / 2 };
  };
  return columnRange;
}

/**
 * The y range Hollow leaves out: not the column's own ends, and inside all four
 * neighbouring columns. Empty when `bottom > top`.
 */
function hiddenRange(
  columnRange: ColumnRange,
  x: number,
  z: number,
  own: YRange,
): YRange {
  let bottom = own.bottom + 1;
  let top = own.top - 1;
  for (const [nx, nz] of [
    [x - 1, z],
    [x + 1, z],
    [x, z - 1],
    [x, z + 1],
  ] as const) {
    const neighbour = columnRange(nx, nz);
    if (!neighbour) return { bottom: 1, top: 0 };
    bottom = Math.max(bottom, neighbour.bottom);
    top = Math.min(top, neighbour.top);
  }
  return { bottom, top };
}

function rejectTube(fill: FillStyle): void {
  if (fill === "tube") throw new Error("Spheres do not support tube fill");
}

function* columns(spec: HeightStepSpec, fill: FillStyle) {
  const { min, max } = spec.base;
  const columnRange = columnRangeOf(spec);
  for (let x = min.x; x <= max.x; x++) {
    for (let z = min.z; z <= max.z; z++) {
      const range = columnRange(x, z);
      if (!range) continue;
      const hidden =
        fill === "hollow"
          ? hiddenRange(columnRange, x, z, range)
          : { bottom: 1, top: 0 };
      yield { x, z, range, hidden };
    }
  }
}

function* sphereCells(spec: HeightedSpec, fill: FillStyle): Generator<Cell> {
  for (const { x, z, range, hidden } of columns(spec, fill)) {
    for (let y = range.bottom; y <= range.top; y++) {
      if (y < hidden.bottom || y > hidden.top) yield { x, y, z };
    }
  }
}

export const spherePlacement: HeightedPlacement = {
  cells(spec, fill) {
    rejectTube(fill);
    return sphereCells(spec, fill);
  },
  // Per column, never per cell: a big box must still be measured within a tick.
  count(spec, fill) {
    rejectTube(fill);
    let total = 0;
    for (const { range, hidden } of columns(spec, fill)) {
      total += range.top - range.bottom + 1;
      total -= Math.max(0, hidden.top - hidden.bottom + 1);
    }
    return total;
  },
};

export const sphereVolume: HeightedVolume = {
  maxHeight(base, worldTopY) {
    return Math.max(1, worldTopY - base.min.y + 1);
  },
  wireframe: sphereWireframe,
};

function sphereWireframe(
  { base: { min, max }, height }: HeightStepSpec,
  maxPoints: number,
): Vec3[] {
  const center = {
    x: (min.x + max.x + 1) / 2,
    y: min.y + height / 2,
    z: (min.z + max.z + 1) / 2,
  };
  const rx = (max.x - min.x + 1) / 2;
  const ry = height / 2;
  const rz = (max.z - min.z + 1) / 2;
  const equator = ellipse(center.x, center.y, center.z, rx, rz);
  const budget = Math.max(0, Math.floor(maxPoints));
  if (height === 1) return outlinePoints([equator], [], budget);

  // The equator alone cannot show height when a large footprint exhausts the budget.
  const equatorPoints = outlinePoints([equator], [], Math.floor(budget / 2));
  const xy = ellipseOn(center, { x: rx, y: 0, z: 0 }, { x: 0, y: ry, z: 0 });
  const zy = ellipseOn(center, { x: 0, y: 0, z: rz }, { x: 0, y: ry, z: 0 });
  const remaining = budget - equatorPoints.length;
  // Four samples include both poles; a proportional split can leave a thin
  // meridian with only two equatorial points and hide its height entirely.
  const minimum = Math.min(4, Math.floor(remaining / 2));
  const xyBudget = Math.max(
    minimum,
    Math.min(
      remaining - minimum,
      Math.round(
        (remaining * Math.ceil(xy.length)) /
          (Math.ceil(xy.length) + Math.ceil(zy.length)),
      ),
    ),
  );
  return [
    ...equatorPoints,
    ...meridianPoints(xy, xyBudget),
    ...meridianPoints(zy, remaining - xyBudget),
  ];
}

function meridianPoints(curve: Curve, budget: number): Vec3[] {
  const capped = Math.min(Math.ceil(curve.length), budget);
  // Quarter turns reach both poles only when the sample count is divisible by four.
  const count = capped >= 4 ? Math.floor(capped / 4) * 4 : capped;
  return Array.from({ length: count }, (_, i) => curve.at(i / count));
}
