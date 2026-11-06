// One block change as planned, as applied, and as recorded for undo.
import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";

export interface PlannedChange {
  readonly cell: Cell;
  readonly after: BlockState;
  /** Required current state before writing; absent means unconditional. */
  readonly expected?: BlockState;
}

export interface AppliedChange {
  readonly cell: Cell;
  readonly before: BlockState;
  readonly after: BlockState;
}

export interface EditRecord {
  readonly dimensionId: DimensionId;
  readonly changes: readonly AppliedChange[];
}

/** Requires the recorded `after` before restoring `before`, last change first. */
export function undoPlan(record: EditRecord): PlannedChange[] {
  return record.changes
    .map((c) => ({ cell: c.cell, after: c.before, expected: c.after }))
    .reverse();
}
