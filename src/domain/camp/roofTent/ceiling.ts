import type { Vec3 } from "../../shared/vec";
import { forward, localOffset } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";
import type { RoofTentSeatVariant } from "./seat";

/** Shell footprint half extents and ridge height per variant, from tools/gen_roof_tent.py. */
export const ROOF_TENT_CEILING_SHAPE = Object.freeze({
  ladder: {
    across: 1.2 * 1.64,
    along: (1.2 * 32) / 2 / 16,
    ridge: ROOF_TENT_SPEC.shellRidge,
  },
  ground: { across: 16 / 16, along: 20 / 16, ridge: 19 / 16 },
} satisfies Record<
  RoofTentSeatVariant,
  { across: number; along: number; ridge: number }
>);

interface CeilingCell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The cells of a rain-stopping ceiling just above a roof tent's ridge: every column the
 * shell footprint overlaps, rotated by the tent yaw, at the first cell above the ridge.
 * Rain is drawn per block column, and entities never occlude it (ADR 0207).
 */
export function roofTentCeilingCells(
  origin: Vec3,
  yawDeg: number,
  variant: RoofTentSeatVariant,
): CeilingCell[] {
  const shape = ROOF_TENT_CEILING_SHAPE[variant];
  const f = forward(yawDeg);
  // Model +x is the entity's left, so "across" runs along the left axis.
  const across = localOffset(f, 0, -1);
  const y = Math.floor(origin.y + shape.ridge) + 1;
  const reach = shape.across + shape.along;
  const cells: CeilingCell[] = [];
  for (
    let x = Math.floor(origin.x - reach);
    x <= Math.ceil(origin.x + reach);
    x++
  )
    for (
      let z = Math.floor(origin.z - reach);
      z <= Math.ceil(origin.z + reach);
      z++
    ) {
      if (overlaps(x - origin.x, z - origin.z, f, across, shape))
        cells.push({ x, y, z });
    }
  return cells;
}

/** Separating-axis test between the unit column square at (x, z) and the oriented rectangle. */
function overlaps(
  dx: number,
  dz: number,
  along: { x: number; z: number },
  across: { x: number; z: number },
  shape: { across: number; along: number },
): boolean {
  // Column centre relative to the tent centre, with the square spanning dx..dx+1.
  const cx = dx + 0.5;
  const cz = dz + 0.5;
  const axes = [
    { a: along, half: shape.along },
    { a: across, half: shape.across },
  ];
  for (const { a, half } of axes) {
    const distance = Math.abs(cx * a.x + cz * a.z);
    const squareReach = 0.5 * (Math.abs(a.x) + Math.abs(a.z));
    if (distance > half + squareReach) return false;
  }
  const rectReachX =
    shape.along * Math.abs(along.x) + shape.across * Math.abs(across.x);
  const rectReachZ =
    shape.along * Math.abs(along.z) + shape.across * Math.abs(across.z);
  return Math.abs(cx) <= rectReachX + 0.5 && Math.abs(cz) <= rectReachZ + 0.5;
}
