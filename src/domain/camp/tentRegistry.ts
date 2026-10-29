// The world's pitched tents, saved as one JSON list (ADR 0131).
import type { DimensionId } from "../shared/ids";
import type { TentId, TentPose, TentYaw } from "./tent";

export interface TentEntry {
  readonly id: TentId;
  readonly dimensionId: DimensionId;
  readonly pose: TentPose;
}

const YAWS: readonly number[] = [0, 90, 180, -90];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function parsePose(v: unknown): TentPose | undefined {
  if (!isRecord(v)) return undefined;
  const { x, y, z, yaw } = v;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    !Number.isInteger(z) ||
    typeof yaw !== "number" ||
    !YAWS.includes(yaw)
  )
    return undefined;
  return {
    x: x as number,
    y: y as number,
    z: z as number,
    yaw: (yaw + 0) as TentYaw,
  };
}

function parseEntry(v: unknown): TentEntry | undefined {
  if (!isRecord(v)) return undefined;
  const { id, dimensionId } = v;
  if (typeof id !== "string" || id === "" || typeof dimensionId !== "string")
    return undefined;
  const pose = parsePose(v.pose);
  if (pose === undefined) return undefined;
  return { id: id as TentId, dimensionId: dimensionId as DimensionId, pose };
}

/** Reads the saved list, a JSON string; drops malformed entries. */
export function parseTents(saved: unknown): TentEntry[] {
  if (typeof saved !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(parseEntry).filter((e): e is TentEntry => e !== undefined);
}

export function serializeTents(list: readonly TentEntry[]): string {
  return JSON.stringify(
    list.map(({ id, dimensionId, pose }) => ({
      id,
      dimensionId,
      pose: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw },
    })),
  );
}

/** Adds `entry`, replacing an entry with the same id. */
export function withTent(
  list: readonly TentEntry[],
  entry: TentEntry,
): TentEntry[] {
  return [...withoutTent(list, entry.id), entry];
}

export function withoutTent(
  list: readonly TentEntry[],
  id: TentId,
): TentEntry[] {
  return list.filter((e) => e.id !== id);
}
