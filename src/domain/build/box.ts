// An axis-aligned box of block cells, both corners inclusive.
import { type Cell, cellKey } from "../shared/cells";

export interface Box {
  readonly min: Cell;
  readonly max: Cell;
}

export function boxOf(a: Cell, b: Cell): Box {
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

const sizeX = (box: Box) => box.max.x - box.min.x + 1;
const sizeY = (box: Box) => box.max.y - box.min.y + 1;
const sizeZ = (box: Box) => box.max.z - box.min.z + 1;

export function volume(box: Box): number {
  return sizeX(box) * sizeY(box) * sizeZ(box);
}

export function contains(box: Box, cell: Cell): boolean {
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
export function* cellsOf(box: Box): Generator<Cell> {
  for (let y = box.min.y; y <= box.max.y; y++) {
    for (let z = box.min.z; z <= box.max.z; z++) {
      for (let x = box.min.x; x <= box.max.x; x++) {
        yield { x, y, z };
      }
    }
  }
}

/**
 * Splits a box into disjoint sub-boxes that cover it, each holding at most
 * maxCells cells, by halving the longest side until a piece fits.
 */
export function chunksOf(box: Box, maxCells: number): Box[] {
  if (volume(box) <= maxCells) return [box];
  const sx = sizeX(box);
  const sy = sizeY(box);
  const sz = sizeZ(box);
  if (sx === 1 && sy === 1 && sz === 1) return [box];
  const axis = sy >= sx && sy >= sz ? "y" : sz >= sx ? "z" : "x";
  const mid = Math.floor((box.min[axis] + box.max[axis]) / 2);
  const low = boxOf(box.min, { ...box.max, [axis]: mid });
  const high = boxOf({ ...box.min, [axis]: mid + 1 }, box.max);
  return [...chunksOf(low, maxCells), ...chunksOf(high, maxCells)];
}

export function translate(box: Box, by: Cell): Box {
  return {
    min: { x: box.min.x + by.x, y: box.min.y + by.y, z: box.min.z + by.z },
    max: { x: box.max.x + by.x, y: box.max.y + by.y, z: box.max.z + by.z },
  };
}

/** Distinct cells along the 12 edges, evenly thinned to at most maxPoints. */
export function edgePoints(box: Box, maxPoints: number): Cell[] {
  if (maxPoints <= 0) return [];
  const seen = new Map<string, Cell>();
  const add = (x: number, y: number, z: number) => {
    const cell = { x, y, z };
    seen.set(cellKey(cell), cell);
  };
  const { min, max } = box;
  for (const y of [min.y, max.y]) {
    for (const z of [min.z, max.z]) {
      for (let x = min.x; x <= max.x; x++) add(x, y, z);
    }
  }
  for (const x of [min.x, max.x]) {
    for (const z of [min.z, max.z]) {
      for (let y = min.y; y <= max.y; y++) add(x, y, z);
    }
  }
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (let z = min.z; z <= max.z; z++) add(x, y, z);
    }
  }
  const all = [...seen.values()];
  if (all.length <= maxPoints) return all;
  const picked: Cell[] = [];
  for (let i = 0; i < maxPoints; i++) {
    picked.push(all[Math.floor((i * all.length) / maxPoints)] as Cell);
  }
  return picked;
}
