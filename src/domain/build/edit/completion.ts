import type { EditKind } from "./change";

export function completionMessage(input: {
  kind: EditKind;
  skipped: number;
  flowOffersUndo: boolean;
}): {
  message: "undoDonePartial" | "undoDone" | "editDone" | "editDoneCount";
  takesUndoHint: boolean;
} {
  if (input.kind === "undo")
    return {
      message: input.skipped > 0 ? "undoDonePartial" : "undoDone",
      takesUndoHint: false,
    };
  const offersUndo = input.kind === "undoable" && input.flowOffersUndo;
  return {
    message: offersUndo ? "editDone" : "editDoneCount",
    takesUndoHint: offersUndo,
  };
}
