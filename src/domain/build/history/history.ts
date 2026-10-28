// A player's recent edits, oldest first, kept for undo.
import type { EditRecord } from "../edit/change";

export interface UndoHistory {
  readonly records: readonly EditRecord[];
}

export const EMPTY_HISTORY: UndoHistory = Object.freeze({ records: [] });

/** Drops the oldest records past depth. An empty record is not added. */
export function withRecord(
  h: UndoHistory,
  r: EditRecord,
  depth: number,
): UndoHistory {
  if (r.changes.length === 0) return h;
  const records = [...h.records, r];
  return { records: depth > 0 ? records.slice(-depth) : [] };
}

export function takeLast(h: UndoHistory): {
  record?: EditRecord;
  rest: UndoHistory;
} {
  const record = h.records[h.records.length - 1];
  if (!record) return { rest: h };
  return { record, rest: { records: h.records.slice(0, -1) } };
}
