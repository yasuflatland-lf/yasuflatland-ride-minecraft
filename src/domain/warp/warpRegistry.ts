import { type Cell, sameCell } from "../shared/cells";
import type { DimensionId } from "../shared/ids";
import type { WarpPointId } from "./ids";
import { WARP_SPEC } from "./spec";
import type { WarpName } from "./warpName";
import type { WarpPoint } from "./warpPoint";

export type WarpRegistry = Readonly<{ points: readonly WarpPoint[] }>;

export function emptyRegistry(): WarpRegistry {
  return { points: [] };
}

export function addPoint(
  reg: WarpRegistry,
  point: WarpPoint,
):
  | { ok: true; registry: WarpRegistry }
  | { ok: false; reason: "full" | "occupied" } {
  if (findPoint(reg, point.id) || pointAt(reg, point.dimension, point.cell)) {
    return { ok: false, reason: "occupied" };
  }
  if (reg.points.length >= WARP_SPEC.maxPoints)
    return { ok: false, reason: "full" };
  return { ok: true, registry: { points: [...reg.points, point] } };
}

export function removePoint(reg: WarpRegistry, id: WarpPointId): WarpRegistry {
  return { points: reg.points.filter((p) => p.id !== id) };
}

export function removeAt(
  reg: WarpRegistry,
  dimension: DimensionId,
  cell: Cell,
): WarpRegistry {
  const point = pointAt(reg, dimension, cell);
  return point ? removePoint(reg, point.id) : reg;
}

export function renamePoint(
  reg: WarpRegistry,
  id: WarpPointId,
  name: WarpName,
): WarpRegistry {
  return { points: reg.points.map((p) => (p.id === id ? { ...p, name } : p)) };
}

export function findPoint(
  reg: WarpRegistry,
  id: WarpPointId,
): WarpPoint | undefined {
  return reg.points.find((p) => p.id === id);
}

export function pointAt(
  reg: WarpRegistry,
  dimension: DimensionId,
  cell: Cell,
): WarpPoint | undefined {
  return reg.points.find(
    (p) => p.dimension === dimension && sameCell(p.cell, cell),
  );
}

export function pointsOf(reg: WarpRegistry): readonly WarpPoint[] {
  return reg.points;
}
