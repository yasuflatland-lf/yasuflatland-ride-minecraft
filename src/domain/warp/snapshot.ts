import type { Cell } from "../shared/cells";
import type { DimensionId } from "../shared/ids";
import { asWarpPointId } from "./ids";
import { parseWarpName } from "./warpName";
import type { WarpPoint } from "./warpPoint";
import {
  addPoint,
  emptyRegistry,
  pointsOf,
  type WarpRegistry,
} from "./warpRegistry";

export const WARP_REGISTRY_VERSION = 1;

export type WarpRegistrySnapshot = Readonly<{
  version: typeof WARP_REGISTRY_VERSION;
  points: readonly Readonly<{
    id: string;
    name: string;
    owner: string;
    dimension: string;
    cell: Cell;
  }>[];
}>;

export function toSnapshot(reg: WarpRegistry): WarpRegistrySnapshot {
  return {
    version: WARP_REGISTRY_VERSION,
    points: pointsOf(reg).map((p) => ({ ...p, cell: { ...p.cell } })),
  };
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function parsePoint(raw: unknown): WarpPoint | undefined {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    typeof raw.name !== "string" ||
    typeof raw.owner !== "string" ||
    typeof raw.dimension !== "string" ||
    !raw.dimension.trim() ||
    !isRecord(raw.cell)
  )
    return undefined;
  const { x, y, z } = raw.cell;
  if (
    typeof x !== "number" ||
    !Number.isInteger(x) ||
    typeof y !== "number" ||
    !Number.isInteger(y) ||
    typeof z !== "number" ||
    !Number.isInteger(z)
  )
    return undefined;
  const name = parseWarpName(raw.name);
  if (!name) return undefined;
  return {
    id: asWarpPointId(raw.id),
    name,
    owner: raw.owner,
    dimension: raw.dimension as DimensionId,
    cell: { x, y, z },
  };
}

export function parseSnapshot(raw: unknown): WarpRegistry | undefined {
  if (
    !isRecord(raw) ||
    raw.version !== WARP_REGISTRY_VERSION ||
    !Array.isArray(raw.points)
  )
    return undefined;
  let reg = emptyRegistry();
  for (const rawPoint of raw.points) {
    const point = parsePoint(rawPoint);
    if (!point) continue;
    const added = addPoint(reg, point);
    if (added.ok) reg = added.registry;
  }
  return reg;
}
