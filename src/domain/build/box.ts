// An axis-aligned box of block cells, both corners inclusive (unlike dock WorldBox, whose max is exclusive).
import type { Cell } from "../shared/cells";
import type { Vec3 } from "../shared/vec";

export interface CellBox {
  readonly min: Cell;
  readonly max: Cell;
}

export function boxOf(a: Cell, b: Cell): CellBox {
  return {
    min: {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      z: Math.min(a.z, b.z),
    },
    max: {
      x: Math.max(a.x, b.x),
      y: Math.max(a.y, b.y),
      z: Math.max(a.z, b.z),
    },
  };
}

const sizeX = (box: CellBox) => box.max.x - box.min.x + 1;
const sizeY = (box: CellBox) => box.max.y - box.min.y + 1;
const sizeZ = (box: CellBox) => box.max.z - box.min.z + 1;

export function volume(box: CellBox): number {
  return sizeX(box) * sizeY(box) * sizeZ(box);
}

export function contains(box: CellBox, cell: Cell): boolean {
  return (
    cell.x >= box.min.x &&
    cell.x <= box.max.x &&
    cell.y >= box.min.y &&
    cell.y <= box.max.y &&
    cell.z >= box.min.z &&
    cell.z <= box.max.z
  );
}

/** Cells with y outermost, then z, then x. */
export function* cellsOf(box: CellBox): Generator<Cell> {
  for (let y = box.min.y; y <= box.max.y; y++) {
    for (let z = box.min.z; z <= box.max.z; z++) {
      for (let x = box.min.x; x <= box.max.x; x++) {
        yield { x, y, z };
      }
    }
  }
}

/**
 * Distinct cells along the 12 edges, evenly thinned to at most maxPoints.
 * Cells are picked by index, so the cost follows maxPoints, not the edge length.
 */
export function edgePoints(box: CellBox, maxPoints: number): Cell[] {
  if (maxPoints <= 0) return [];
  const { min, max } = box;
  const unique = (a: number, b: number) => (a === b ? [a] : [a, b]);
  const xs = unique(min.x, max.x);
  const ys = unique(min.y, max.y);
  const zs = unique(min.z, max.z);
  // Edges along x cover every cell with y and z extreme. Edges along y and z
  // then add only the interior cells, so no cell is counted twice.
  const alongX = sizeX(box) * ys.length * zs.length;
  const interiorY = Math.max(sizeY(box) - 2, 0);
  const alongY = interiorY * xs.length * zs.length;
  const interiorZ = Math.max(sizeZ(box) - 2, 0);
  const alongZ = interiorZ * xs.length * ys.length;
  const total = alongX + alongY + alongZ;

  const cellAt = (index: number): Cell => {
    if (index < alongX) {
      const rest = Math.floor(index / sizeX(box));
      return {
        x: min.x + (index % sizeX(box)),
        y: ys[rest % ys.length] as number,
        z: zs[Math.floor(rest / ys.length)] as number,
      };
    }
    const j = index - alongX;
    if (j < alongY) {
      const rest = Math.floor(j / interiorY);
      return {
        x: xs[rest % xs.length] as number,
        y: min.y + 1 + (j % interiorY),
        z: zs[Math.floor(rest / xs.length)] as number,
      };
    }
    const k = j - alongY;
    const rest = Math.floor(k / interiorZ);
    return {
      x: xs[rest % xs.length] as number,
      y: ys[Math.floor(rest / xs.length)] as number,
      z: min.z + 1 + (k % interiorZ),
    };
  };

  const count = Math.min(total, maxPoints);
  const picked: Cell[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(cellAt(Math.floor((i * total) / count)));
  }
  return picked;
}

export function center(p: Vec3): Vec3 {
  return { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 };
}
