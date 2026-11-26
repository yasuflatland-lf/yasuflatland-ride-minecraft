import { sameCell } from "../../shared/cells";
import type { BlockTap } from "../blockTap";
import { BUILD_SPEC } from "../spec";

export type TapDecision = "set" | "confirm" | "ignore";

/** Same dimension and cell; the face is ignored. */
export function sameTapSpot(a: BlockTap, b: BlockTap): boolean {
  return a.dimensionId === b.dimensionId && sameCell(a.cell, b.cell);
}

/** quietTicks counts from the previous wand press event of any kind. */
export function classifyTap(
  current: BlockTap | undefined,
  tap: BlockTap,
  quietTicks: number,
): TapDecision {
  if (!current || !sameTapSpot(current, tap)) return "set";
  return isDeliberate(quietTicks) ? "confirm" : "ignore";
}

export function isDeliberate(quietTicks: number): boolean {
  return quietTicks > BUILD_SPEC.tapConfirmQuietTicks;
}
