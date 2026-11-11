// A player's recent edits, oldest first, kept for undo.
import type { DimensionId } from "../../shared/ids";
import type { CellBox } from "../box";
import type { EditRecord } from "../edit/change";
import type { StructureHandle } from "../structure/handle";

export interface SnapshotRecord {
  readonly dimensionId: DimensionId;
  /** The box that was overwritten. */
  readonly box: CellBox;
  /** The box as it was before the edit. */
  readonly handle: StructureHandle;
}

export type UndoEntry =
  | { readonly kind: "cells"; readonly record: EditRecord }
  | { readonly kind: "snapshot"; readonly snapshot: SnapshotRecord };

export interface UndoHistory {
  readonly entries: readonly UndoEntry[];
}

export const EMPTY_HISTORY: UndoHistory = Object.freeze({ entries: [] });

/** Keeps the newest `depth` entries across all kinds and returns evicted structures for disposal. */
export function withEntry(
  history: UndoHistory,
  entry: UndoEntry,
  depth: number,
): { history: UndoHistory; dropped: readonly StructureHandle[] } {
  if (entry.kind === "cells" && entry.record.changes.length === 0)
    return { history, dropped: [] };
  const entries = [...history.entries, entry];
  const excess = Math.max(0, entries.length - Math.max(depth, 0));
  return {
    history: { entries: entries.slice(excess) },
    dropped: entries
      .slice(0, excess)
      .flatMap((entry) =>
        entry.kind === "snapshot" ? [entry.snapshot.handle] : [],
      ),
  };
}

export function takeLast(history: UndoHistory): {
  entry?: UndoEntry;
  rest: UndoHistory;
} {
  const entry = history.entries[history.entries.length - 1];
  if (!entry) return { rest: history };
  return { entry, rest: { entries: history.entries.slice(0, -1) } };
}

export function withPutBack(
  history: UndoHistory,
  entry: UndoEntry,
): UndoHistory {
  return { entries: [...history.entries, entry] };
}
