import fc from "fast-check";
import { expect, it } from "vitest";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { EditJobs } from "../../../src/application/build/editJobs";
import { EndBuildSession } from "../../../src/application/build/endBuildSession";
import { EndPasting } from "../../../src/application/build/endPasting";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { NewCopy } from "../../../src/application/build/newCopy";
import { AIR } from "../../../src/domain/build/blockState";
import { boxOf, volume } from "../../../src/domain/build/box";
import {
  type Clipboard,
  clipboardOf,
  structureOf,
} from "../../../src/domain/build/clipboard/clipboard";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { StructureHandle } from "../../../src/domain/build/structure/handle";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("builder");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const side = fc.integer({ min: 1, max: 16 });
const boxArb = fc
  .tuple(cell, side, side, side)
  .map(([min, x, y, z]) =>
    boxOf(min, { x: min.x + x - 1, y: min.y + y - 1, z: min.z + z - 1 }),
  );
function setup() {
  const repo = new FakeSessions();
  const structures = new FakeStructureStore();
  const feedback = new FakeFeedback();
  const copy = new CopyBox(repo, structures, feedback);
  return { repo, structures, feedback, copy };
}

it("captures exactly once with the owner and dimension and stores the full box size and volume", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const e = setup();
      expect(e.copy.execute(playerId, overworld, box)).toBe(true);
      expect(e.structures.calls).toEqual([
        { kind: "capture", dimensionId: overworld, box, ownerId: playerId },
      ]);
      const clipboard = e.repo.get(playerId)?.clipboard;
      expect(clipboard).toEqual({
        size: {
          x: box.max.x - box.min.x + 1,
          y: box.max.y - box.min.y + 1,
          z: box.max.z - box.min.z + 1,
        },
        blockCount: volume(box),
        contents: { kind: "structure", handle: [...e.structures.live][0] },
      });
      expect(e.feedback.messages).toEqual([
        { message: "copied", count: volume(box) },
      ]);
    }),
  );
});

it("keeps the old structure live during New copy and discards it only after successful replacement by copy or cut", () => {
  fc.assert(
    fc.property(boxArb, fc.boolean(), fc.boolean(), (box, newCopy, cut) => {
      const e = setup();
      e.copy.execute(playerId, overworld, box);
      const session = e.repo.getOrCreate(playerId);
      const old = structureOf(session.clipboard);
      if (newCopy) new NewCopy(e.repo).execute(playerId);
      expect(e.structures.live).toEqual(new Set([old]));
      if (cut) {
        const world = new FakeWorld();
        const jobs = new EditJobs(
          e.repo,
          world,
          e.feedback,
          { warn: () => {} },
          new FakeBuildPlayers(),
        );
        expect(
          new CutBox(e.repo, world, e.structures, e.feedback, { warn: () => {} }).execute(
            playerId,
            overworld,
            box,
          ),
        ).toBe(true);
        expect(session.clipboard?.contents.kind).toBe("cells");
        expect(e.structures.live.size).toBe(0);
      } else {
        e.copy.execute(playerId, overworld, box);
        expect(e.structures.live).toEqual(
          new Set([structureOf(session.clipboard)]),
        );
      }
      expect(
        e.structures.calls.filter((call) => call.kind === "discard"),
      ).toEqual([{ kind: "discard", handle: old }]);
    }),
  );
});

it("discards cleared structures once through every exit and leaves no live clipboard structures", () => {
  fc.assert(
    fc.property(
      boxArb,
      fc.constantFrom("clear", "end", "leave", "disconnect"),
      fc.boolean(),
      (box, exit, cells) => {
        const e = setup();
        const session = e.repo.getOrCreate(playerId);
        if (cells)
          session.completeCopy(
            overworld,
            box,
            clipboardOf(box, () => AIR),
          );
        else e.copy.execute(playerId, overworld, box);
        const old = structureOf(session.clipboard);
        const clear = () => {
          if (exit === "clear") {
            const handle = session.clearClipboard();
            if (handle !== undefined) e.structures.discard(handle);
          } else if (exit === "end")
            new EndPasting(e.repo, e.structures).execute(playerId);
          else if (exit === "leave")
            new LeaveBuild(e.repo, e.structures).execute(playerId);
          else new EndBuildSession(e.repo, e.structures).execute(playerId);
        };
        clear();
        clear();
        expect(session.clipboard).toBeUndefined();
        expect(e.structures.live.size).toBe(0);
        expect(
          e.structures.calls.filter((call) => call.kind === "discard"),
        ).toEqual(cells ? [] : [{ kind: "discard", handle: old }]);
        expect(e.repo.get(playerId)).toBe(
          exit === "disconnect" ? undefined : session,
        );
      },
    ),
  );
});

it("refuses without changing a present session or creating an absent one, preserving live handles and messages", () => {
  fc.assert(
    fc.property(
      boxArb,
      fc.constantFrom("tooLarge", "unreadable", "volume"),
      fc.boolean(),
      (box, refusal, present) => {
        const e = setup();
        if (present) {
          e.copy.execute(playerId, overworld, box);
          new NewCopy(e.repo).execute(playerId);
        }
        const session = e.repo.get(playerId);
        const flow = session?.flow;
        const clipboard = session?.clipboard;
        const confirmed = session?.confirmedBox;
        const live = new Set(e.structures.live);
        e.structures.calls.length = 0;
        e.feedback.messages.length = 0;
        if (refusal !== "volume") e.structures.captureRefusal = refusal;
        const target =
          refusal === "volume"
            ? boxOf(box.min, {
                ...box.min,
                x: box.min.x + BUILD_SPEC.maxCopyVolume,
              })
            : box;
        expect(e.copy.execute(playerId, overworld, target)).toBe(false);
        expect(e.repo.get(playerId)).toBe(session);
        expect(session?.flow).toBe(flow);
        expect(session?.clipboard).toBe(clipboard);
        expect(session?.confirmedBox).toBe(confirmed);
        expect(e.structures.live).toEqual(live);
        expect(e.structures.calls).toEqual(
          refusal === "volume"
            ? []
            : [
                {
                  kind: "capture",
                  dimensionId: overworld,
                  box,
                  ownerId: playerId,
                },
              ],
        );
        expect(e.feedback.messages).toEqual([
          refusal === "unreadable"
            ? { message: "copyUnreadable", count: undefined }
            : { message: "tooLarge", count: volume(target) },
        ]);
      },
    ),
  );
});

it("replaces a cells clipboard without discarding a structure", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const e = setup();
      e.repo.getOrCreate(playerId).completeCopy(
        overworld,
        box,
        clipboardOf(box, () => AIR),
      );
      e.copy.execute(playerId, overworld, box);
      expect(e.structures.calls.map((call) => call.kind)).toEqual(["capture"]);
    }),
  );
});

const lifecycleOperation = fc.constantFrom(
  "copy",
  "precheckTooLarge",
  "storeTooLarge",
  "storeUnreadable",
  "cut",
  "newCopy",
  "endPasting",
  "leaveBuild",
  "endSession",
);

it.each(["absent", "structure", "cells"] as const)(
  "owns exactly the current clipboard handle throughout arbitrary operations starting with %s",
  (initial) => {
    fc.assert(
      fc.property(
        boxArb,
        fc.array(fc.record({ operation: lifecycleOperation, box: boxArb }), {
          minLength: 1,
          maxLength: 40,
          size: "large",
        }),
        (initialBox, operations) => {
          const e = setup();
          const world = new FakeWorld();
          const jobs = new EditJobs(
            e.repo,
            world,
            e.feedback,
            { warn: () => {} },
            new FakeBuildPlayers(),
          );
          const cut = new CutBox(e.repo, world, e.structures, e.feedback, { warn: () => {} });
          const captured = new Set<StructureHandle>();
          const discarded = new Set<StructureHandle>();
          let expectedClipboard: Clipboard | undefined;
          let replacement: Clipboard | undefined;
          let sessionExists = false;
          const capture = e.structures.capture.bind(e.structures);
          e.structures.capture = (dimensionId, box, ownerId) => {
            const result = capture(dimensionId, box, ownerId);
            if (result !== "tooLarge" && result !== "unreadable") {
              expect(captured.has(result)).toBe(false);
              captured.add(result);
              replacement = {
                size: {
                  x: box.max.x - box.min.x + 1,
                  y: box.max.y - box.min.y + 1,
                  z: box.max.z - box.min.z + 1,
                },
                blockCount: volume(box),
                contents: { kind: "structure", handle: result },
              };
            }
            return result;
          };
          const discard = e.structures.discard.bind(e.structures);
          e.structures.discard = (handle) => {
            expect(captured.has(handle)).toBe(true);
            expect(discarded.has(handle)).toBe(false);
            expect(e.structures.live.has(handle)).toBe(true);
            const session = e.repo.get(playerId);
            expect(structureOf(session?.clipboard)).not.toBe(handle);
            // Observe storage at the port call: final-state checks cannot detect early disposal.
            expect(session?.clipboard).toEqual(replacement);
            discarded.add(handle);
            discard(handle);
          };

          const prefix =
            initial === "absent"
              ? []
              : [
                  {
                    operation: initial === "structure" ? "copy" : "cut",
                    box: initialBox,
                  } as const,
                ];
          for (const { operation, box } of [...prefix, ...operations]) {
            const before = e.repo.get(playerId);
            const flow = before?.flow;
            const confirmedBox = before?.confirmedBox;
            const clipboard = before?.clipboard;
            const snapshot = structuredClone({ flow, confirmedBox, clipboard });
            const callCount = e.structures.calls.length;
            const oldHandle = structureOf(expectedClipboard);
            replacement = undefined;
            e.structures.captureRefusal = undefined;
            const refused =
              operation === "precheckTooLarge" ||
              operation === "storeTooLarge" ||
              operation === "storeUnreadable";

            if (operation === "copy" || refused) {
              if (operation === "storeTooLarge")
                e.structures.captureRefusal = "tooLarge";
              if (operation === "storeUnreadable")
                e.structures.captureRefusal = "unreadable";
              const target =
                operation === "precheckTooLarge"
                  ? boxOf(box.min, {
                      ...box.min,
                      x: box.min.x + BUILD_SPEC.maxCopyVolume,
                    })
                  : box;
              expect(e.copy.execute(playerId, overworld, target)).toBe(
                !refused,
              );
              if (!refused) {
                expect(replacement).toBeDefined();
                expectedClipboard = replacement;
                sessionExists = true;
              }
            } else if (operation === "cut") {
              replacement = clipboardOf(box, () => AIR);
              expect(cut.execute(playerId, overworld, box)).toBe(true);
              expectedClipboard = replacement;
              sessionExists = true;
              jobs.step();
            } else if (operation === "newCopy") {
              new NewCopy(e.repo).execute(playerId);
            } else {
              if (operation === "endPasting")
                new EndPasting(e.repo, e.structures).execute(playerId);
              else if (operation === "leaveBuild")
                new LeaveBuild(e.repo, e.structures).execute(playerId);
              else {
                new EndBuildSession(e.repo, e.structures).execute(playerId);
                sessionExists = false;
              }
              expectedClipboard = undefined;
            }

            const session = e.repo.get(playerId);
            expect(session !== undefined).toBe(sessionExists);
            expect(session?.clipboard).toEqual(expectedClipboard);
            const handle = structureOf(expectedClipboard);
            const expectedLive = new Set(handle === undefined ? [] : [handle]);
            expect(e.structures.live).toEqual(expectedLive);
            expect(
              new Set([...captured].filter((value) => !discarded.has(value))),
            ).toEqual(expectedLive);
            const calls = e.structures.calls.slice(callCount);
            expect(calls.filter((call) => call.kind === "discard")).toEqual(
              oldHandle !== undefined && oldHandle !== handle
                ? [{ kind: "discard", handle: oldHandle }]
                : [],
            );
            if (refused) {
              expect(session).toBe(before);
              expect(session?.flow).toBe(flow);
              expect(session?.confirmedBox).toBe(confirmedBox);
              expect(session?.clipboard).toBe(clipboard);
              expect({
                flow: session?.flow,
                confirmedBox: session?.confirmedBox,
                clipboard: session?.clipboard,
              }).toEqual(snapshot);
              expect(calls).toEqual(
                operation === "precheckTooLarge"
                  ? []
                  : [
                      {
                        kind: "capture",
                        dimensionId: overworld,
                        box,
                        ownerId: playerId,
                      },
                    ],
              );
            }
          }
          replacement = undefined;
          new EndBuildSession(e.repo, e.structures).execute(playerId);
          expect(e.structures.live.size).toBe(0);
          expect(discarded).toEqual(captured);
        },
      ),
      { numRuns: 100 },
    );
  },
);
