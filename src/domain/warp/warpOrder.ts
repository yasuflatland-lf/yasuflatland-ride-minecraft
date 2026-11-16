import type { DimensionId } from "../shared/ids";
import { distanceSq, type Vec3 } from "../shared/vec";
import type { WarpPoint } from "./warpPoint";

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function orderForPlayer(
  points: readonly WarpPoint[],
  from: { dimension: DimensionId; position: Vec3 },
): readonly WarpPoint[] {
  return [...points].sort((a, b) => {
    const aHere = a.dimension === from.dimension;
    const bHere = b.dimension === from.dimension;
    if (aHere !== bHere) return aHere ? -1 : 1;
    const primary = aHere
      ? distanceSq(a.cell, from.position) - distanceSq(b.cell, from.position)
      : compareText(a.dimension, b.dimension);
    return primary || compareText(a.name, b.name) || compareText(a.id, b.id);
  });
}

export function pageOf<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize: number,
): { items: readonly T[]; pageIndex: number; pageCount: number } {
  const size = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const index = Number.isNaN(pageIndex) ? 0 : Math.floor(pageIndex);
  const clamped = Math.max(0, Math.min(pageCount - 1, index));
  return {
    items: items.slice(clamped * size, (clamped + 1) * size),
    pageIndex: clamped,
    pageCount,
  };
}
