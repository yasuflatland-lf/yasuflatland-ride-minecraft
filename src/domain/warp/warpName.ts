import type { Brand } from "../shared/ids";
import { WARP_SPEC } from "./spec";

export type WarpName = Brand<string, "WarpName">;

export function parseWarpName(raw: string): WarpName | undefined {
  const name = Array.from(raw.trim())
    .slice(0, WARP_SPEC.nameMaxLength)
    .join("")
    .trimEnd();
  return name ? (name as WarpName) : undefined;
}

export function defaultWarpName(taken: readonly WarpName[]): WarpName {
  const names = new Set<string>(taken);
  let n = 1;
  while (names.has(`Warp ${n}`)) n++;
  return `Warp ${n}` as WarpName;
}
