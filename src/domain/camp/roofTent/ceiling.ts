import type { Cell } from "../../shared/cells";
import { footprintColumns, rectFootprint } from "../../shared/footprint";
import type { RoofTentShell } from "../../shared/roofTent";
import type { Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

/** Shell footprint half extents and ridge height per variant, from tools/gen_roof_tent.py. */
export const ROOF_TENT_CEILING_SHAPE = Object.freeze({
  raised: {
    across: 1.2 * 1.64,
    along: (1.2 * 32) / 2 / 16,
    ridge: ROOF_TENT_SPEC.shellRidge,
  },
  flat: { across: 16 / 16, along: 20 / 16, ridge: 19 / 16 },
} satisfies Record<
  RoofTentShell,
  { across: number; along: number; ridge: number }
>);

/**
 * The cells of a rain-stopping ceiling just above a roof tent's ridge: every column the
 * shell footprint overlaps, rotated by the tent yaw, at the first cell above the ridge.
 * Rain is drawn per block column, and entities never occlude it (ADR 0207).
 */
export function roofTentCeilingCells(
  origin: Vec3,
  yawDeg: number,
  variant: RoofTentShell,
): Cell[] {
  const shape = ROOF_TENT_CEILING_SHAPE[variant];
  return footprintColumns(
    origin,
    yawDeg,
    rectFootprint(shape.across, shape.along),
    Math.floor(origin.y + shape.ridge) + 1,
  );
}
