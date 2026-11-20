import type { Cell } from "../../../domain/shared/cells";
import { asPlayerId, type PlayerId } from "../../../domain/shared/ids";

export function decodeExit(raw: unknown): Cell | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const value = JSON.parse(raw) as Cell | null;
    if (value && [value.x, value.y, value.z].every(Number.isFinite))
      return value;
  } catch {
    return undefined;
  }
}

export function encodeExit(exit: Cell): string {
  return JSON.stringify(exit);
}

export function decodeSpawnSetters(raw: unknown): PlayerId[] {
  if (typeof raw !== "string") return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value) && value.every((id) => typeof id === "string"))
      return value.map(asPlayerId);
  } catch {
    return [];
  }
  return [];
}

export function encodeSpawnSetters(setters: readonly PlayerId[]): string {
  return JSON.stringify(setters);
}
