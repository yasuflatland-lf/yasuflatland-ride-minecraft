import {
  type BlockState,
  sameBlockState,
  sameBlockStateIgnoringDerived,
} from "../blockState";
import type { AppliedChange, EditKind, PlannedChange } from "./change";
import { isKeptState } from "./guard";

type WriteDecision = "skip" | "conflict" | "unchanged" | "write";
type WriteOutcome = Exclude<WriteDecision, "write"> | "written";

export function decideWrite(
  before: BlockState | undefined,
  change: PlannedChange,
  _kind: EditKind,
  mayEdit: () => boolean,
): WriteDecision {
  if (!before) return "skip";
  if (
    change.expected &&
    !sameBlockStateIgnoringDerived(before, change.expected)
  )
    return sameBlockState(before, change.after) ? "unchanged" : "conflict";
  if (sameBlockState(before, change.after)) return "unchanged";
  if (isKeptState(before) || !mayEdit()) return "skip";
  return "write";
}

export interface EditTally {
  changed: number;
  skipped: number;
  readonly applied: AppliedChange[];
}

export function tallyWrite(
  kind: EditKind,
  outcome: WriteOutcome,
  change: PlannedChange,
  before: BlockState | undefined,
): { changed: number; skipped: number; applied?: AppliedChange } {
  if (outcome === "written") {
    return {
      changed: 1,
      skipped: 0,
      applied:
        kind === "undoable" && before
          ? { cell: change.cell, before, after: change.after }
          : undefined,
    };
  }
  return {
    changed: 0,
    skipped:
      outcome === "conflict" || (outcome === "skip" && kind === "undo") ? 1 : 0,
  };
}
