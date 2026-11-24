import { type Cell, cellCenter, cellOf } from "./cells";
import { localOffset, type Vec2, type Vec3 } from "./vec";

/** Grid offset from the pressed column in a cardinal placement direction. */
export interface CellOffset {
  readonly ahead: number;
  readonly left: number;
}

export function footprintOffsets(
  cells: readonly CellOffset[],
  facing: Vec2,
): Vec2[] {
  return cells.map(({ ahead, left }) => {
    const offset = localOffset(facing, ahead, -left);
    return { x: Math.round(offset.x), z: Math.round(offset.z) };
  });
}

function offsetCentre(offsets: readonly Vec2[]): Vec2 {
  return {
    x: offsets.reduce((sum, offset) => sum + offset.x, 0) / offsets.length,
    z: offsets.reduce((sum, offset) => sum + offset.z, 0) / offsets.length,
  };
}

/** Centroid of a nonempty footprint, one block above the pressed block. */
export function footprintOrigin(pressed: Cell, offsets: readonly Vec2[]): Vec3 {
  const centre = offsetCentre(offsets);
  const base = cellCenter(pressed, 1);
  return { x: base.x + centre.x, y: base.y, z: base.z + centre.z };
}

export function footprintCellsAt(
  origin: Vec3,
  offsets: readonly Vec2[],
): Cell[] {
  const centre = offsetCentre(offsets);
  return offsets.map((offset) =>
    cellOf({
      x: origin.x + offset.x - centre.x,
      y: origin.y,
      z: origin.z + offset.z - centre.z,
    }),
  );
}

export function footprintSupportCells(floor: readonly Cell[]): Cell[] {
  return floor.map((cell) => ({ ...cell, y: cell.y - 1 }));
}

export function footprintClearCells(
  floor: readonly Cell[],
  clearance: number,
  order: "layer" | "column" = "layer",
): Cell[] {
  const layers = Array.from({ length: clearance }, (_, up) => up);
  if (order === "column")
    return floor.flatMap((cell) =>
      layers.map((up) => ({ ...cell, y: cell.y + up })),
    );
  return layers.flatMap((up) =>
    floor.map((cell) => ({ ...cell, y: cell.y + up })),
  );
}
