import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  reportEditCompletion,
  SnapshotEdit,
} from "../../../src/application/build/snapshotEdit";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import type { EditKind } from "../../../src/domain/build/edit/change";
import { BuildSession } from "../../../src/domain/build/session";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { structureHandle } from "../../../src/domain/build/structure/handle";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { overworld as dimensionId, FakeFeedback } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
const coordinate = fc.integer({ min: -3, max: 3 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const boxes = fc.tuple(cell, cell).map(([a, b]) => boxOf(a, b));
const box = boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });

function setup() {
  const session = new BuildSession(playerId);
  const structures = new FakeStructureStore();
  const feedback = new FakeFeedback();
  const edit = new SnapshotEdit(session, structures, feedback, {
    dimensionId,
    playerId,
  });
  return { session, structures, feedback, edit };
}

it("checks cells in box order and stops at the first refusal", () => {
  fc.assert(
    fc.property(
      boxes,
      fc.option(fc.nat(), { nil: undefined }),
      (box, index) => {
        const { edit, structures } = setup();
        const cells = [...cellsOf(box)];
        const blocked = index === undefined ? undefined : index % cells.length;
        let checked = 0;
        const allows = vi.fn(() => checked++ !== blocked);
        const refuse = vi.fn();
        expect(
          edit.preflight(box, { allows, busy: "alreadyChecked" }, refuse),
        ).toBe(blocked === undefined ? undefined : "blocked");
        expect(allows.mock.calls).toEqual(
          cells
            .slice(0, blocked === undefined ? cells.length : blocked + 1)
            .map((cell) => [cell]),
        );
        expect(refuse).toHaveBeenCalledTimes(blocked === undefined ? 0 : 1);
        expect(structures.calls).toEqual([]);
      },
    ),
  );
});

it.each([
  ["beforeProtection", false, "busy", 0],
  ["afterProtection", false, "blocked", 1],
  ["afterProtection", true, "busy", 2],
  ["alreadyChecked", true, undefined, 2],
] as const)(
  "checks busy %s with protection allowed %s",
  (busy, allowed, result, checks) => {
    const { edit, session, feedback } = setup();
    session.beginEdit();
    const allows = vi.fn(() => allowed);
    const refuse = vi.fn();
    expect(edit.preflight(box, { allows, busy }, refuse)).toBe(result);
    expect(allows).toHaveBeenCalledTimes(checks);
    expect(refuse).toHaveBeenCalledTimes(result === "blocked" ? 1 : 0);
    expect(feedback.messages).toEqual(
      result === "busy" ? [{ message: "busy", count: undefined }] : [],
    );
  },
);

it("captures exact snapshots and forwards the store's refusal", () => {
  fc.assert(
    fc.property(
      boxes,
      fc.constantFrom(undefined, "tooLarge", "unreadable"),
      (box, refusal) => {
        const { edit, structures } = setup();
        structures.captureRefusal = refusal;
        const refuse = vi.fn();
        const handle = edit.captureExact(box, refuse);
        expect(structures.calls).toEqual([
          {
            kind: "capture",
            dimensionId,
            box,
            ownerId: playerId,
            mode: "exact",
          },
        ]);
        if (refusal) {
          expect(handle).toBeUndefined();
          expect(refuse).toHaveBeenCalledExactlyOnceWith(refusal);
        } else {
          expect([...structures.live]).toEqual([handle]);
          expect(refuse).not.toHaveBeenCalled();
        }
      },
    ),
  );
});

it("commits the snapshot and queues the evicted handle for release", () => {
  const { edit, session, structures } = setup();
  const handles = Array.from({ length: BUILD_SPEC.undoDepth + 1 }, (_, i) =>
    structureHandle(`snapshot_${i}`),
  );
  for (const handle of handles) {
    edit.commit({ box, handle, paste: true });
  }
  expect(session.drainReleased()).toEqual([handles[0]]);
  expect(structures.calls).toEqual([]);
  expect(session.takeUndo()).toEqual({
    kind: "snapshot",
    snapshot: { box, handle: handles.at(-1), dimensionId, paste: true },
  });
});

it("rolls back with the operation's entity clearing and handle retention policy", () => {
  fc.assert(
    fc.property(
      boxes,
      fc.boolean(),
      fc.constantFrom("cut", "rotate", "pasteOrUndo"),
      (box, placed, operation) => {
        const { edit, structures } = setup();
        const snapshot = structureHandle("snapshot");
        const source = structureHandle("source");
        structures.live.add(snapshot);
        structures.live.add(source);
        structures.placeSucceeds = placed;
        const options =
          operation === "cut"
            ? ({
                clearEntities: false,
                retainOnFailure: true,
                discardWithSnapshot: source,
              } as const)
            : operation === "rotate"
              ? { discardWithSnapshot: source }
              : undefined;
        expect(edit.rollback(box, snapshot, options)).toBe(placed);
        const retained = operation === "cut" && !placed;
        expect(structures.calls).toEqual([
          ...(operation === "cut"
            ? []
            : [{ kind: "clearEntities", dimensionId, box }]),
          {
            kind: "place",
            dimensionId,
            anchor: box.min,
            handle: snapshot,
            turn: 0,
          },
          ...(retained || operation === "pasteOrUndo"
            ? []
            : [{ kind: "discard", handle: source }]),
          ...(retained ? [] : [{ kind: "discard", handle: snapshot }]),
        ]);
        expect(structures.live.has(snapshot)).toBe(retained);
      },
    ),
  );
});

it("reports the changed and skipped counts and spends the hint only on a qualifying completion", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(0), fc.nat()),
      fc.oneof(fc.constant(0), fc.nat()),
      fc.constantFrom<EditKind>("undoable", "undo", "irreversible"),
      fc.boolean(),
      fc.boolean(),
      (count, skipped, kind, idle, hasHistory) => {
        const { session, feedback, edit } = setup();
        if (!idle) session.setFlow({ kind: "pasteAim", manualTurn: 0 });
        if (hasHistory)
          edit.commit({ box, handle: structureHandle("history") });
        reportEditCompletion(session, feedback, playerId, kind, count, skipped);
        const offered = kind === "undoable" && idle && hasHistory;
        const partial = kind === "undo" && skipped > 0;
        expect(feedback.undoHints).toEqual(
          offered && count > 0 ? [playerId] : [],
        );
        expect(feedback.messages).toEqual([
          partial
            ? { message: "undoDonePartial", count, skippedCount: skipped }
            : {
                message:
                  kind === "undo"
                    ? "undoDone"
                    : offered
                      ? "editDone"
                      : "editDoneCount",
                count,
              },
        ]);
        session.setFlow({ kind: "idle" });
        edit.commit({ box, handle: structureHandle("later") });
        reportEditCompletion(session, feedback, playerId, "undoable", 1, 0);
        reportEditCompletion(session, feedback, playerId, "undoable", 1, 0);
        expect(feedback.undoHints).toEqual([playerId]);
      },
    ),
  );
});
