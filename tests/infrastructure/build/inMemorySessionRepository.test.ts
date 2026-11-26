import fc from "fast-check";
import { expect, it } from "vitest";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  type Clipboard,
  clipboardOf,
} from "../../../src/domain/build/clipboard/clipboard";
import type { UndoEntry } from "../../../src/domain/build/history/history";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { StructureHandle } from "../../../src/domain/build/structure/handle";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { InMemorySessionRepository } from "../../../src/infrastructure/build/persistence/inMemorySessionRepository";
import { overworld } from "../../application/build/fakes";
import { FakeStructureStore } from "../../application/build/fakes/structureStore";

const player = asPlayerId("builder");
const cell = cellOf({ x: 0, y: 0, z: 0 });
const box = boxOf(cell, cell);
const material = blockStateOf("minecraft:stone");
const selection = selectionOf(overworld, box, material);
const record = {
  dimensionId: overworld,
  changes: [{ cell, before: AIR, after: material }],
};
const edit = fc.constantFrom("recordSnapshot", "finishEdit");
const step = fc.oneof(
  edit,
  fc.constantFrom(
    "completeCopy",
    "repeatCopy",
    "clearClipboard",
    "endPasting",
    "leaveBuildMode",
    "clearHistory",
    "irreversibleEdit",
  ),
);

it("keeps exactly the clipboard and snapshot handles referenced by the session after each update", () => {
  fc.assert(
    fc.property(
      fc.array(edit, { minLength: BUILD_SPEC.undoDepth, maxLength: 20 }),
      fc.array(step, { maxLength: 80 }),
      (edits, steps) => {
        const store = new FakeStructureStore();
        const repo = new InMemorySessionRepository(store, { warn: () => {} });
        const session = repo.getOrCreate(player);
        const history: (StructureHandle | undefined)[] = [];
        let clipboard: Clipboard | undefined;
        const capture = (mode: "copy" | "exact") => {
          const handle = store.capture(overworld, box, player, mode);
          if (handle === "tooLarge" || handle === "unreadable")
            throw new Error(`Unexpected capture refusal: ${handle}`);
          return handle;
        };

        for (const operation of [
          "recordSnapshot",
          ...edits,
          ...steps,
        ] as const) {
          repo.update(session, () => {
            switch (operation) {
              case "completeCopy":
                clipboard = clipboardOf({
                  selection,
                  facing: "north",
                  handle: capture("copy"),
                });
                session.completeCopy(selection, clipboard);
                break;
              case "repeatCopy":
                if (clipboard) session.completeCopy(selection, clipboard);
                break;
              case "clearClipboard":
              case "endPasting":
              case "leaveBuildMode":
                session[operation]();
                clipboard = undefined;
                break;
              case "recordSnapshot": {
                const handle = capture("exact");
                session.recordSnapshot({ box, handle, dimensionId: overworld });
                history.push(handle);
                break;
              }
              case "finishEdit":
                session.beginEdit();
                session.finishEdit(record, "undoable");
                history.push(undefined);
                break;
              case "irreversibleEdit":
                session.beginEdit();
                session.finishEdit(record, "irreversible");
                break;
              case "clearHistory":
                session.clearHistory();
                history.length = 0;
                break;
            }
          });
          if (history.length > BUILD_SPEC.undoDepth) history.shift();
          const expected = [...history, clipboard?.contents.handle].filter(
            (handle) => handle !== undefined,
          );
          expect(store.live).toEqual(new Set(expected));
          expect(session.clipboard).toBe(clipboard);
          expect(session.hasHistory).toBe(history.length > 0);
        }

        const retained: UndoEntry[] = [];
        for (
          let entry = session.takeUndo();
          typeof entry !== "string";
          entry = session.takeUndo()
        )
          retained.push(entry);
        expect(
          retained.map((entry) =>
            entry.kind === "snapshot" ? entry.snapshot.handle : undefined,
          ),
        ).toEqual([...history].reverse());
        for (const entry of retained.reverse()) session.putBackUndo(entry);

        repo.remove(player);
        expect(store.live.size).toBe(0);
        const discarded = store.calls.flatMap((call) =>
          call.kind === "discard" ? [call.handle] : [],
        );
        expect(new Set(discarded).size).toBe(discarded.length);
      },
    ),
  );
});

it("drains released handles when an update throws after clearing history", () => {
  const store = new FakeStructureStore();
  const repo = new InMemorySessionRepository(store, { warn: () => {} });
  const session = repo.getOrCreate(player);
  const handle = store.capture(overworld, box, player, "exact");
  if (handle === "tooLarge" || handle === "unreadable")
    throw new Error(`Unexpected capture refusal: ${handle}`);
  repo.update(session, () => {
    session.recordSnapshot({ box, handle, dimensionId: overworld });
  });

  const error = new Error("Update failed after clearing history");
  expect(() =>
    repo.update(session, () => {
      session.clearHistory();
      throw error;
    }),
  ).toThrow(error);
  expect(store.live.size).toBe(0);
});
