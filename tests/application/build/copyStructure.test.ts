import fc from "fast-check";
import { expect, it } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { EndBuildSession } from "../../../src/application/build/endBuildSession";
import { EndPasting } from "../../../src/application/build/endPasting";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { MenuChoices } from "../../../src/application/build/menuChoices";
import { SetPoint } from "../../../src/application/build/setPoint";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, volume } from "../../../src/domain/build/box";
import {
  type Clipboard,
  structureOf,
} from "../../../src/domain/build/clipboard/clipboard";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { StructureHandle } from "../../../src/domain/build/structure/handle";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";
import {
  confirmEndpointHeight,
  tapAir,
  tapBlock,
} from "../../support/buildSelection";
import {
  FakeFeedback,
  FakeSessions,
  FakeTapTargets,
  FakeWorld,
  overworld,
} from "./fakes";
import { menuCasesFor } from "./fakes/menuChoices";
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
  const structures = new FakeStructureStore();
  const repo = new FakeSessions(structures);
  const feedback = new FakeFeedback();
  const copy = new CopyBox(repo, structures, feedback);
  return { repo, structures, feedback, copy };
}

it("captures exactly once with the owner and dimension and stores the full box size and volume", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const e = setup();
      expect(
        e.copy.execute({
          playerId,
          selection: selectionOf(overworld, box, AIR),
          facing: "east",
        }),
      ).toBe(true);
      expect(e.structures.calls).toEqual([
        {
          kind: "capture",
          dimensionId: overworld,
          box,
          ownerId: playerId,
          mode: "copy",
        },
      ]);
      const clipboard = e.repo.get(playerId)?.clipboard;
      expect(clipboard).toEqual({
        material: AIR,
        size: {
          x: box.max.x - box.min.x + 1,
          y: box.max.y - box.min.y + 1,
          z: box.max.z - box.min.z + 1,
        },
        blockCount: volume(box),
        facing: "east",
        contents: { kind: "structure", handle: [...e.structures.live][0] },
      });
      expect(e.feedback.messages).toEqual([
        { message: "copied", count: volume(box) },
      ]);
    }),
  );
});

it("carries the source selection material in the session clipboard", () => {
  fc.assert(
    fc.property(boxArb, fc.integer({ min: 0, max: 3 }), (box, direction) => {
      const e = setup();
      const material = blockStateOf("minecraft:oak_stairs", {
        weirdo_direction: direction,
        upside_down_bit: true,
      });
      e.copy.execute({
        playerId,
        selection: selectionOf(overworld, box, material),
        facing: "east",
      });
      expect(e.repo.get(playerId)?.clipboard?.material).toEqual(material);
    }),
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
          e.copy.execute({
            playerId,
            selection: selectionOf(overworld, box, AIR),
            facing: "east",
          });
          e.repo.get(playerId)?.startNewCopy();
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
        expect(
          e.copy.execute({
            playerId,
            selection: selectionOf(overworld, target, AIR),
            facing: "east",
          }),
        ).toBe(false);
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
                  mode: "copy",
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

it.each(["absent", "structure"] as const)(
  "owns the clipboard and history handles throughout arbitrary operations starting with %s",
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
          const cut = new CutBox(
            e.repo,
            new FakeWorld(),
            e.structures,
            e.feedback,
            { warn: () => {} },
          );
          const captured = new Set<StructureHandle>();
          const discarded = new Set<StructureHandle>();
          const captures: StructureHandle[] = [];
          const capture = e.structures.capture.bind(e.structures);
          e.structures.capture = (dimensionId, box, ownerId, mode) => {
            const result = capture(dimensionId, box, ownerId, mode);
            if (result !== "tooLarge" && result !== "unreadable") {
              expect(captured.has(result)).toBe(false);
              captured.add(result);
              captures.push(result);
            }
            return result;
          };
          const discard = e.structures.discard.bind(e.structures);
          e.structures.discard = (handle) => {
            expect(captured.has(handle)).toBe(true);
            expect(discarded.has(handle)).toBe(false);
            expect(e.structures.live.has(handle)).toBe(true);
            expect(structureOf(e.repo.get(playerId)?.clipboard)).not.toBe(
              handle,
            );
            discarded.add(handle);
            discard(handle);
          };
          let clipboardHandle: StructureHandle | undefined;
          let snapshotHandles: StructureHandle[] = [];
          let expectedClipboard: Clipboard | undefined;
          let sessionExists = false;
          const prefix =
            initial === "structure"
              ? [{ operation: "copy" as const, box: initialBox }]
              : [];
          for (const { operation, box } of [...prefix, ...operations]) {
            const before = e.repo.get(playerId);
            const state = structuredClone(before);
            const flow = before?.flow;
            const confirmed = before?.confirmedBox;
            const clipboard = before?.clipboard;
            const callCount = e.structures.calls.length;
            const oldLive = new Set(
              [clipboardHandle, ...snapshotHandles].filter(
                (h) => h !== undefined,
              ),
            );
            captures.length = 0;
            e.structures.captureRefusal =
              operation === "storeTooLarge"
                ? "tooLarge"
                : operation === "storeUnreadable"
                  ? "unreadable"
                  : undefined;
            const refused =
              operation === "precheckTooLarge" ||
              operation === "storeTooLarge" ||
              operation === "storeUnreadable";
            if (operation === "copy" || refused || operation === "cut") {
              const target =
                operation === "precheckTooLarge"
                  ? boxOf(box.min, {
                      ...box.min,
                      x: box.min.x + BUILD_SPEC.maxCopyVolume,
                    })
                  : box;
              expect(
                (operation === "cut" ? cut : e.copy).execute({
                  playerId,
                  selection: selectionOf(overworld, target, AIR),
                  facing: "east",
                }),
              ).toBe(!refused);
              if (!refused) {
                clipboardHandle = captures[0];
                if (clipboardHandle === undefined)
                  throw new Error("Expected captured clipboard");
                if (operation === "cut") {
                  const snapshot = captures[1];
                  if (snapshot === undefined)
                    throw new Error("Expected snapshot");
                  snapshotHandles = [...snapshotHandles, snapshot].slice(
                    -BUILD_SPEC.undoDepth,
                  );
                }
                expectedClipboard = {
                  material: AIR,
                  size: {
                    x: box.max.x - box.min.x + 1,
                    y: box.max.y - box.min.y + 1,
                    z: box.max.z - box.min.z + 1,
                  },
                  blockCount: volume(box),
                  facing: "east",
                  contents: { kind: "structure", handle: clipboardHandle },
                };
                sessionExists = true;
              }
            } else if (operation === "newCopy")
              e.repo.get(playerId)?.startNewCopy();
            else {
              if (operation === "endPasting")
                new EndPasting(e.repo).execute(playerId);
              else if (operation === "leaveBuild")
                new LeaveBuild(e.repo, new FakeTapTargets()).execute(playerId);
              else {
                new EndBuildSession(e.repo, new FakeTapTargets()).execute(
                  playerId,
                );
                snapshotHandles = [];
                sessionExists = false;
              }
              clipboardHandle = undefined;
              expectedClipboard = undefined;
            }
            const session = e.repo.get(playerId);
            expect(session !== undefined).toBe(sessionExists);
            expect(session?.clipboard).toEqual(expectedClipboard);
            expect(structureOf(session?.clipboard)).toBe(clipboardHandle);
            if (snapshotHandles.length > 0) {
              const entry = session?.takeUndo();
              expect(entry).toMatchObject({
                kind: "snapshot",
                snapshot: { handle: snapshotHandles.at(-1) },
              });
              if (!entry || typeof entry === "string")
                throw new Error("Expected snapshot");
              session?.putBackUndo(entry);
            } else expect(session?.hasHistory ?? false).toBe(false);
            const live = new Set(
              [clipboardHandle, ...snapshotHandles].filter(
                (h) => h !== undefined,
              ),
            );
            expect(e.structures.live).toEqual(live);
            expect(
              new Set([...captured].filter((h) => !discarded.has(h))),
            ).toEqual(live);
            const calls = e.structures.calls.slice(callCount);
            expect(
              new Set(
                calls.filter((c) => c.kind === "discard").map((c) => c.handle),
              ),
            ).toEqual(new Set([...oldLive].filter((h) => !live.has(h))));
            if (refused) {
              expect(session).toBe(before);
              expect(session).toEqual(state);
              expect(session?.flow).toBe(flow);
              expect(session?.confirmedBox).toBe(confirmed);
              expect(session?.clipboard).toBe(clipboard);
              expect(calls).toEqual(
                operation === "precheckTooLarge"
                  ? []
                  : [
                      {
                        kind: "capture",
                        dimensionId: overworld,
                        box,
                        ownerId: playerId,
                        mode: "copy",
                      },
                    ],
              );
            }
          }
          new EndBuildSession(e.repo, new FakeTapTargets()).execute(playerId);
          expect(e.structures.live.size).toBe(0);
          expect(discarded).toEqual(captured);
        },
      ),
      { numRuns: 100 },
    );
  },
);

const stone = blockStateOf("minecraft:stone");

function setupNewCopy(from: { x: number; y: number; z: number }) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const box = boxOf(from, from);
  const old = structureClipboard(box, () => stone);
  session.completeCopy(selectionOf(overworld, box, stone), old);
  session.setFlowForTest({
    kind: "pasteAim",
    manualTurn: 1,
    facing: "north",
  });
  const choices = new MenuChoices(repo, menuCasesFor(repo, world), {
    blocks: world,
    feedback,
    refresh: () => {},
  });
  const chooseBoxStep = new ChooseBoxStep(
    repo,
    {
      copy: new CopyBox(repo, new FakeStructureStore(), feedback),
      cut: new CutBox(repo, world, new FakeStructureStore(), feedback, {
        warn: () => {},
      }),
    },
    feedback,
    { facingOf: () => "east" },
  );
  return { repo, session, world, feedback, old, choices, chooseBoxStep };
}

it("starts a normal selection with the old clipboard, then replaces it on Copy", () => {
  fc.assert(
    fc.property(cell, fc.integer({ min: 1, max: 8 }), (from, length) => {
      const e = setupNewCopy(from);
      expect(e.choices.choosePaste(playerId, "newCopy")).toBe(true);
      expect(e.session.flow).toEqual({ kind: "idle" });
      expect(e.session.confirmedBox).toBeUndefined();
      expect(e.session.clipboard).toBe(e.old);
      const to = { ...from, x: from.x + length };
      e.world.put(from, stone);
      const points = new SetPoint(e.repo, e.world, e.feedback);
      points.execute({ playerId, dimensionId: overworld, cell: from });
      const first = tapBlock({ kind: "idle" }, overworld, from, stone);
      expect(e.session.flow).toEqual(first);
      expect(e.session.clipboard).toBe(e.old);
      points.execute({ playerId, dimensionId: overworld, cell: to });
      expect(e.session.flow).toEqual(tapBlock(first, overworld, to, stone));
      e.chooseBoxStep.execute({ playerId, kind: "copy" });
      expect(e.session.clipboard).not.toBe(e.old);
      expect(e.session.clipboard).toMatchObject({
        size: { x: length + 1, y: 1, z: 1 },
        blockCount: length + 1,
        facing: "east",
        contents: { kind: "structure" },
      });
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
    }),
  );
});

it("keeps the old clipboard and selection on an oversized new copy, and keeps it on cancel or clear", () => {
  fc.assert(
    fc.property(cell, fc.integer({ min: 1, max: 100 }), (from, extra) => {
      const e = setupNewCopy(from);
      expect(e.choices.choosePaste(playerId, "newCopy")).toBe(true);
      const selected = confirmEndpointHeight(
        tapAir(tapBlock(e.session.flow, overworld, from, stone), {
          ...from,
          x: from.x + BUILD_SPEC.maxCopyVolume + extra,
        }),
      );
      e.session.setFlowForTest(selected);
      e.chooseBoxStep.execute({ playerId, kind: "copy" });
      expect(e.feedback.messages.at(-1)?.message).toBe("tooLarge");
      expect(e.session.flow).toBe(selected);
      expect(e.session.clipboard).toBe(e.old);
      e.session.clearSelection();
      expect(e.session.flow.kind).toBe("idle");
      expect(e.session.clipboard).toBe(e.old);
      new ClearSelection(e.repo, e.feedback).execute({ playerId });
      expect(e.session.flow).toEqual({ kind: "idle" });
      expect(e.session.clipboard).toBe(e.old);
    }),
  );
});
