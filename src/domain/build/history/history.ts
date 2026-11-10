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

/**
 * Cell entries keep the newest `depth`, and an empty record is not added. A
 * snapshot entry replaces every older one; their handles come back as
 * `dropped` so the caller can discard the structures.
 */
export function withEntry(
  history: UndoHistory,
  entry: UndoEntry,
  depth: number,
): { history: UndoHistory; dropped: readonly StructureHandle[] } {
  if (entry.kind === "cells") {
    if (entry.record.changes.length === 0) return { history, dropped: [] };
    const entries = [...history.entries, entry];
    let excess =
      entries.filter((e) => e.kind === "cells").length - Math.max(depth, 0);
    const kept = entries.filter((e) => {
      if (e.kind === "cells" && excess > 0) {
        excess--;
        return false;
      }
      return true;
    });
    return { history: { entries: kept }, dropped: [] };
  }
  const dropped: StructureHandle[] = [];
  const kept = history.entries.filter((e) => {
    if (e.kind !== "snapshot") return true;
    dropped.push(e.snapshot.handle);
    return false;
  });
  return { history: { entries: [...kept, entry] }, dropped };
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
