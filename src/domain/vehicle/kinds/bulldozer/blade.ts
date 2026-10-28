import type { Vec3 } from "../../../shared/vec";
import type { CutColumn } from "../../cut";
import { rectCells } from "../../cutArea";
import type { BladeRule } from "./spec";

export interface ShaftBox {
  readonly halfExtent: number;
  readonly bodyHeight: number;
  readonly reach: number;
}

export function bladeColumns(
  location: Vec3,
  yaw: number,
  rule: BladeRule,
  flying: boolean,
  grounded = !flying,
): CutColumn[] {
  // Feet on a partial block (dirt path, farmland, mud, a bottom slab) stand inside
  // that block's row, so a ground cut starts one row up to keep the floor. A
  // hovering body at fractional height still needs the row it sits in (ADR 0136).
  // A fixed-height cut resting on the ground, such as a submarine on the seabed,
  // keeps the floor too (ADR 0155).
  const bottom = grounded
    ? Math.ceil(location.y - 0.01)
    : Math.floor(location.y + 0.01);
  const height = flying
    ? Math.ceil(location.y + rule.bodyHeight) - bottom
    : undefined;
  return rectCells(location, yaw, rule).map((cell) => ({
    ...cell,
    bottom,
    ...(height === undefined ? {} : { height }),
  }));
}

/**
 * The columns of the square, axis-aligned box that reaches `halfExtent` blocks
 * from `location` on x and z, over the `reach` cells starting at the cell that
 * holds the body's top (ADR 0155). The box follows the compass, not the yaw.
 */
export function shaftColumns(
  location: Vec3,
  { halfExtent, bodyHeight, reach }: ShaftBox,
): CutColumn[] {
  const bottom = Math.floor(location.y + bodyHeight);
  const columns: CutColumn[] = [];
  for (
    let x = Math.floor(location.x - halfExtent);
    x < location.x + halfExtent;
    x++
  )
    for (
      let z = Math.floor(location.z - halfExtent);
      z < location.z + halfExtent;
      z++
    )
      columns.push({ x, z, bottom, height: reach });
  return columns;
}
