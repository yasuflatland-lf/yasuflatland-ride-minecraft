// A player's recent edits, oldest first, kept for undo.
import type { EditRecord } from "../edit/change";

export interface UndoHistory {
  readonly records: readonly EditRecord[];
}

export const EMPTY_HISTORY: UndoHistory = Object.freeze({ records: [] });

/** Drops the oldest records past depth. An empty record is not added. */
export function withRecord(
  history: UndoHistory,
  record: EditRecord,
  depth: number,
): UndoHistory {
  if (record.changes.length === 0) return history;
  const records = [...history.records, record];
  return { records: depth > 0 ? records.slice(-depth) : [] };
}

export function takeLast(history: UndoHistory): {
  record?: EditRecord;
  rest: UndoHistory;
} {
  const record = history.records[history.records.length - 1];
  if (!record) return { rest: history };
  return { record, rest: { records: history.records.slice(0, -1) } };
}
