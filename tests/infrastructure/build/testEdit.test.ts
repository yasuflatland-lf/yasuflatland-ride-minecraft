import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { BuildFeedback } from "../../../src/application/build/ports/feedback";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { recordMessages } from "../../../src/infrastructure/build/bedrock/handlers/testEdit";

vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server" },
  system: {},
  world: {},
}));

function setup() {
  const feedback = {
    showMessage: vi.fn<BuildFeedback["showMessage"]>(),
    showUndoHint: vi.fn<BuildFeedback["showUndoHint"]>(),
    showSize: vi.fn<BuildFeedback["showSize"]>(),
    showPasteHint: vi.fn<BuildFeedback["showPasteHint"]>(),
    drawPreview: vi.fn<BuildFeedback["drawPreview"]>(),
  };
  return { feedback, messages: recordMessages(feedback) };
}

const player = asPlayerId("player");
const other = asPlayerId("other");
const optionalCount = fc.option(fc.nat(), { nil: undefined });

it("forwards every message argument and records only the latest message per player", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("undoDonePartial", "undoDone", "building"),
      optionalCount,
      optionalCount,
      (message, count, skippedCount) => {
        const { feedback, messages } = setup();
        const material = blockStateOf("minecraft:oak_log", {
          pillar_axis: "x",
        });
        expect(messages.last(player)).toBeUndefined();
        messages.feedback.showMessage(player, "editDone", 12);
        messages.feedback.showMessage(other, "copied", 7);
        messages.feedback.showMessage(
          player,
          message,
          count,
          material,
          skippedCount,
        );
        expect(feedback.showMessage).toHaveBeenLastCalledWith(
          player,
          message,
          count,
          material,
          skippedCount,
        );
        expect(messages.last(player)).toEqual({ message, count, skippedCount });
        expect(messages.last(other)).toEqual({
          message: "copied",
          count: 7,
          skippedCount: undefined,
        });
        messages.feedback.showMessage(player, "selectionCleared");
        expect(messages.last(player)).toEqual({
          message: "selectionCleared",
          count: undefined,
          skippedCount: undefined,
        });
      },
    ),
  );
});

it("forwards undo hints, counts them per player, and forgets only that player's records", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 20 }), (count) => {
      const { feedback, messages } = setup();
      expect(messages.hints(player)).toBe(0);
      messages.feedback.showMessage(player, "undoDonePartial", 3, undefined, 2);
      messages.feedback.showMessage(other, "undoDone", 4);
      messages.feedback.showUndoHint(other);
      for (let i = 0; i < count; i++) messages.feedback.showUndoHint(player);
      expect(feedback.showUndoHint.mock.calls).toEqual([
        [other],
        ...Array.from({ length: count }, () => [player]),
      ]);
      expect(messages.hints(player)).toBe(count);
      expect(messages.hints(other)).toBe(1);
      messages.forget(player);
      expect(messages.last(player)).toBeUndefined();
      expect(messages.hints(player)).toBe(0);
      expect(messages.last(other)?.message).toBe("undoDone");
      expect(messages.hints(other)).toBe(1);
      messages.feedback.showUndoHint(player);
      expect(messages.hints(player)).toBe(1);
    }),
  );
});
