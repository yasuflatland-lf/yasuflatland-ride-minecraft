import type { Cell } from "./cells";
import { dot, forward, localOffset, type Vec2, type Vec3 } from "./vec";

const footprintBrand: unique symbol = Symbol("Footprint");

/** Convex counterclockwise polygon in local block units: x is left, z is ahead. */
export interface Footprint {
  readonly [footprintBrand]: true;
  readonly corners: readonly Vec2[];
}

function footprint(corners: Vec2[]): Footprint {
  return Object.freeze({
    [footprintBrand]: true as const,
    corners: Object.freeze(corners.map((corner) => Object.freeze(corner))),
  });
}

function checkExtent(value: number): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError("Footprint half extents must be finite and positive");
}

export function rectFootprint(
  halfAcross: number,
  halfAlong: number,
): Footprint {
  checkExtent(halfAcross);
  checkExtent(halfAlong);
  return footprint([
    { x: -halfAcross, z: -halfAlong },
    { x: halfAcross, z: -halfAlong },
    { x: halfAcross, z: halfAlong },
    { x: -halfAcross, z: halfAlong },
  ]);
}

/** Regular octagon with axis-facing sides, sized by half its flat-to-flat width. */
export function regularOctagonFootprint(flatHalfWidth: number): Footprint {
  checkExtent(flatHalfWidth);
  const r = flatHalfWidth;
  const s = r * Math.tan(Math.PI / 8);
  return footprint([
    { x: -s, z: -r },
    { x: s, z: -r },
    { x: r, z: -s },
    { x: r, z: s },
    { x: s, z: r },
    { x: -s, z: r },
    { x: -r, z: s },
    { x: -r, z: -s },
  ]);
}

/** Includes touching columns, matching the roof tent's original SAT rule. */
export function footprintColumns(
  origin: Vec3,
  yawDeg: number,
  shape: Footprint,
  y: number,
): Cell[] {
  const f = forward(yawDeg);
  const corners = shape.corners.map((c) => localOffset(f, c.z, -c.x));
  const axes: Vec2[] = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
  ];
  for (let i = 0; i < shape.corners.length; i++) {
    const a = shape.corners[i] as Vec2;
    const b = shape.corners[(i + 1) % shape.corners.length] as Vec2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    axes.push(localOffset(f, dx / length, dz / length));
  }
  const projections = axes.map((axis) => {
    const values = corners.map((c) => dot(c, axis));
    return {
      axis,
      min: Math.min(...values),
      max: Math.max(...values),
      squareReach: (Math.abs(axis.x) + Math.abs(axis.z)) / 2,
    };
  });
  const reach = Math.max(...shape.corners.map((c) => Math.hypot(c.x, c.z)));
  const cells: Cell[] = [];
  for (
    let x = Math.floor(origin.x - reach);
    x <= Math.ceil(origin.x + reach);
    x++
  ) {
    for (
      let z = Math.floor(origin.z - reach);
      z <= Math.ceil(origin.z + reach);
      z++
    ) {
      const centre = { x: x - origin.x + 0.5, z: z - origin.z + 0.5 };
      if (
        projections.every(({ axis, min, max, squareReach }) => {
          const distance = dot(centre, axis);
          return distance >= min - squareReach && distance <= max + squareReach;
        })
      )
        cells.push({ x, y, z });
    }
  }
  return cells;
}
