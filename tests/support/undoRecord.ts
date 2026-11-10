import type { EditRecord } from "../../src/domain/build/edit/change";
import type { UndoEntry } from "../../src/domain/build/history/history";

/** The cell record of a cells entry; a refusal passes through. */
export function undoRecord(taken: UndoEntry | string): EditRecord | string {
  if (typeof taken === "string") return taken;
  if (taken.kind !== "cells") throw new Error("expected a cells entry");
  return taken.record;
}
