import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  type BuildFlow,
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { pasteMenu, utilityMenu } from "../../../src/domain/build/flow/menu";
import {
  beginPasteAim,
  followFacing,
  isRepeat,
  recordPaste,
} from "../../../src/domain/build/flow/paste";
import {
  FACINGS,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import { BuildSession } from "../../../src/domain/build/session";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";

const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimensionId = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone");

it("following any facing keeps the immutable paste record", () => {
  fc.assert(
    fc.property(
      cell,
      fc.nat(),
      fc.constantFrom("north", "east", "south", "west"),
      (anchor, tick, facing) => {
        const initial = recordPaste(beginPasteAim(), anchor, 2, tick);
        const next = followFacing(initial, facing);
        expect(next.facing).toBe(facing);
        expect(next.lastPaste).toBe(initial.lastPaste);
        expect(Object.isFrozen(next)).toBe(true);
        expect(recordPaste(next, anchor, 3, tick + 1).facing).toBe(facing);
        expect(initial.facing).toBeUndefined();
      },
    ),
  );
});

it("records an immutable paste and suppresses only the same anchor within the window", () => {
  fc.assert(
    fc.property(
      cell,
      fc.nat({ max: 10000 }),
      fc.integer({ min: 1, max: 100 }),
      (anchor, tick, window) => {
        const initial = beginPasteAim();
        expect(Object.isFrozen(initial)).toBe(true);
        expect(isRepeat(initial, anchor, 0, tick, window)).toBe(false);
        const flow = recordPaste(initial, anchor, 0, tick);
        expect(flow).toEqual({
          kind: "pasteAim",
          manualTurn: 0,
          lastPaste: { anchor, turn: 0, tick },
        });
        expect(initial).toEqual({ kind: "pasteAim", manualTurn: 0 });
        expect(Object.isFrozen(flow)).toBe(true);
        expect(Object.isFrozen(flow.lastPaste)).toBe(true);
        expect(Object.isFrozen(flow.lastPaste?.anchor)).toBe(true);
        expect(flow.lastPaste?.anchor).not.toBe(anchor);
        expect(
          isRepeat(flow, { ...anchor }, 0, tick + window - 1, window),
        ).toBe(true);
        expect(isRepeat(flow, anchor, 0, tick + window, window)).toBe(false);
        expect(isRepeat(flow, anchor, 0, tick + window + 1, window)).toBe(
          false,
        );
        for (const turn of [1, 2, 3] as const)
          expect(isRepeat(flow, anchor, turn, tick, window)).toBe(false);
        for (const axis of ["x", "y", "z"] as const)
          expect(
            isRepeat(
              flow,
              { ...anchor, [axis]: anchor[axis] + 1 },
              0,
              tick,
              window,
            ),
          ).toBe(false);
      },
    ),
  );
});

it("offers ordered paste entries by history and never paste or endPaste in the utility menu", () => {
  fc.assert(
    fc.property(
      cell,
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (at, confirmed, clipboard, history) => {
        const session = new BuildSession(asPlayerId("p"));
        const box = boxOf(at, at);
        if (confirmed) session.confirmBox(dimensionId, box);
        if (clipboard)
          holdClipboard(
            session,
            structureClipboard(box, () => stone),
          );
        if (history)
          session.finishEdit(
            {
              dimensionId,
              changes: [{ cell: at, before: stone, after: stone }],
            },
            "undoable",
          );
        const idle: BuildFlow = { kind: "idle" };
        const first = tapBlock(idle, dimensionId, at, stone);
        const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
        const height = chooseHeighted(endpoint, "gable");
        for (const flow of [idle, first, endpoint, height, beginPasteAim()]) {
          session.setFlow(flow);
          const entries = utilityMenu(session).map(({ id }) => id);
          expect(entries).not.toContain("endPaste");
          expect(entries).not.toContain("paste");
          expect(
            pasteMenu({
              hasHistory: session.hasHistory,
            }).map(({ id }) => id),
          ).toEqual([
            ...(history ? ["undo"] : []),
            "newCopy",
            "endPaste",
            "cancel",
          ]);
        }
      },
    ),
  );
});

it("derives the session turn from copy and paste facings, and ignores following outside aiming", () => {
  fc.assert(
    fc.property(
      cell,
      fc.constantFrom(...FACINGS),
      fc.constantFrom(...FACINGS),
      (at, copiedFacing, currentFacing) => {
        const session = new BuildSession(asPlayerId("p"));
        const idle = session.flow;
        session.followPasteFacing(currentFacing);
        expect(session.flow).toBe(idle);
        expect(session.pasteTurn).toBe(0);
        session.setFlow(beginPasteAim());
        session.followPasteFacing(currentFacing);
        expect(session.pasteTurn).toBe(0);
        const box = boxOf(at, at);
        session.completeCopy(dimensionId, box, {
          ...structureClipboard(box),
          facing: copiedFacing,
        });
        expect(session.pasteTurn).toBe(0);
        session.followPasteFacing(currentFacing);
        expect(session.pasteTurn).toBe(
          turnBetween(copiedFacing, currentFacing),
        );
      },
    ),
  );
});
