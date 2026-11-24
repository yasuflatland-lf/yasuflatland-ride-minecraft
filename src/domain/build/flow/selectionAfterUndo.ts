import { sameBox } from "../box";
import type { UndoEntry } from "../history/history";
import { inDimension, type Selection, withBox } from "../selection";
import type { BuildFlow } from "./state";
import { cornerTaps, type Taps } from "./taps";

export function selectionAfterUndo(
  entry: UndoEntry,
  flow: BuildFlow,
  confirmedBox: Selection | undefined,
  clipboardPresent: boolean,
):
  | { aimPaste: true }
  | { restore: { selection: Selection; taps: Taps } }
  | undefined {
  if (entry.kind === "snapshot" && entry.snapshot.paste) {
    if (
      clipboardPresent &&
      flow.kind === "selected" &&
      inDimension(flow.selection, entry.snapshot.dimensionId) &&
      sameBox(flow.selection.box, entry.snapshot.box)
    )
      return { aimPaste: true };
    return undefined;
  }

  const edit = entry.kind === "snapshot" ? entry.snapshot : entry.record;
  const before = edit.selectionBefore;
  if (!before || (flow.kind !== "selected" && flow.kind !== "baseHeight"))
    return undefined;
  if (!inDimension(flow.selection, edit.dimensionId)) return undefined;
  if (
    entry.kind === "cells" &&
    (flow.kind !== "selected" ||
      flow.selection !== confirmedBox ||
      !entry.record.selectionAfter ||
      !sameBox(flow.selection.box, entry.record.selectionAfter))
  )
    return undefined;

  return {
    restore: {
      selection: withBox(flow.selection, before),
      taps: edit.selectionBeforeTaps ?? cornerTaps(before),
    },
  };
}
