// The ceiling plate leaves 2.81 blocks of headroom and supports a roof flush with layer four (ADR 0068).
export const CEILING_LAYER = 3;
export const INSIDE_LAYERS = [1, 2] as const;
export const ROOF_LAYER = 4;

/** A cell in roomGeometry.ts coordinates: x = left (-1..1), z = forward (-3..3), layer = cells above the floor layer. */
export interface LocalCell {
  readonly x: number;
  readonly z: number;
  readonly layer: number;
}

export function sameLocalCell(a: LocalCell, b: LocalCell): boolean {
  return a.x === b.x && a.z === b.z && a.layer === b.layer;
}
