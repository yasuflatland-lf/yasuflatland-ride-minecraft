// An axis-aligned box of block cells, both corners inclusive (unlike dock WorldBox, whose max is exclusive).
import type { Cell } from "../shared/cells";
import type { Vec3 } from "../shared/vec";

export interface CellBox {
  readonly min: Cell;
  readonly max: Cell;
}

export type Size = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export function sizeOf(box: CellBox): Size {
  return {
    x: box.max.x - box.min.x + 1,
    y: box.max.y - box.min.y + 1,
    z: box.max.z - box.min.z + 1,
  };
}

export function boxFromSize(min: Cell, size: Size): CellBox {
  return {
    min,
    max: {
      x: min.x + size.x - 1,
      y: min.y + size.y - 1,
      z: min.z + size.z - 1,
    },
  };
}

export function rotatedQuarter(size: Size): Size {
  return { x: size.z, y: size.y, z: size.x };
}

export function unionOf(a: CellBox, b: CellBox): CellBox {
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}

export function boxWithHeight(base: CellBox, height: number): CellBox {
  return { min: base.min, max: { ...base.max, y: base.min.y + height - 1 } };
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

export function volume(box: CellBox): number {
  const { x, y, z } = sizeOf(box);
  return x * y * z;
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
  const size = sizeOf(box);
  const unique = (a: number, b: number) => (a === b ? [a] : [a, b]);
  const xs = unique(min.x, max.x);
  const ys = unique(min.y, max.y);
  const zs = unique(min.z, max.z);
  // Edges along x cover every cell with y and z extreme. Edges along y and z
  // then add only the interior cells, so no cell is counted twice.
  const alongX = size.x * ys.length * zs.length;
  const interiorY = Math.max(size.y - 2, 0);
  const alongY = interiorY * xs.length * zs.length;
  const interiorZ = Math.max(size.z - 2, 0);
  const alongZ = interiorZ * xs.length * ys.length;
  const total = alongX + alongY + alongZ;

  const cellAt = (index: number): Cell => {
    if (index < alongX) {
      const rest = Math.floor(index / size.x);
      return {
        x: min.x + (index % size.x),
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
