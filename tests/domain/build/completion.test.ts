import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BuildMessage } from "../../../src/application/build/ports/feedback";
import type { EditKind } from "../../../src/domain/build/edit/change";
import { completionMessage } from "../../../src/domain/build/edit/completion";

describe("completionMessage", () => {
  it.each<{
    kind: EditKind;
    hasSkipped: boolean;
    flowOffersUndo: boolean;
    message: BuildMessage;
    takesUndoHint: boolean;
  }>([
    {
      kind: "undoable",
      hasSkipped: false,
      flowOffersUndo: false,
      message: "editDoneCount",
      takesUndoHint: false,
    },
    {
      kind: "undoable",
      hasSkipped: true,
      flowOffersUndo: false,
      message: "editDoneCount",
      takesUndoHint: false,
    },
    {
      kind: "undoable",
      hasSkipped: false,
      flowOffersUndo: true,
      message: "editDone",
      takesUndoHint: true,
    },
    {
      kind: "undoable",
      hasSkipped: true,
      flowOffersUndo: true,
      message: "editDone",
      takesUndoHint: true,
    },
    {
      kind: "undo",
      hasSkipped: false,
      flowOffersUndo: false,
      message: "undoDone",
      takesUndoHint: false,
    },
    {
      kind: "undo",
      hasSkipped: true,
      flowOffersUndo: false,
      message: "undoDonePartial",
      takesUndoHint: false,
    },
    {
      kind: "undo",
      hasSkipped: false,
      flowOffersUndo: true,
      message: "undoDone",
      takesUndoHint: false,
    },
    {
      kind: "undo",
      hasSkipped: true,
      flowOffersUndo: true,
      message: "undoDonePartial",
      takesUndoHint: false,
    },
    {
      kind: "irreversible",
      hasSkipped: false,
      flowOffersUndo: false,
      message: "editDoneCount",
      takesUndoHint: false,
    },
    {
      kind: "irreversible",
      hasSkipped: true,
      flowOffersUndo: false,
      message: "editDoneCount",
      takesUndoHint: false,
    },
    {
      kind: "irreversible",
      hasSkipped: false,
      flowOffersUndo: true,
      message: "editDoneCount",
      takesUndoHint: false,
    },
    {
      kind: "irreversible",
      hasSkipped: true,
      flowOffersUndo: true,
      message: "editDoneCount",
      takesUndoHint: false,
    },
  ])(
    "$kind, skipped=$hasSkipped, offers undo=$flowOffersUndo",
    ({ kind, hasSkipped, flowOffersUndo, message, takesUndoHint }) => {
      fc.assert(
        fc.property(
          hasSkipped ? fc.integer({ min: 1 }) : fc.constant(0),
          (skipped) => {
            const result = completionMessage({ kind, skipped, flowOffersUndo });
            const compatibleMessage: BuildMessage = result.message;
            expect(compatibleMessage).toBe(message);
            expect(result).toEqual({ message, takesUndoHint });
          },
        ),
      );
    },
  );
});
