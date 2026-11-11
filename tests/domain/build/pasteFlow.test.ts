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
  isRepeat,
  recordPaste,
  rotatePasteAim,
} from "../../../src/domain/build/flow/paste";
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

it("four turns restore any aim and recording a paste preserves its turn", () => {
  fc.assert(
    fc.property(
      cell,
      fc.nat(),
      fc.constantFrom(0, 1, 2, 3),
      (anchor, tick, steps) => {
        let aim = recordPaste(beginPasteAim(), anchor, tick);
        for (let i = 0; i < steps; i++) aim = rotatePasteAim(aim);
        const initial = aim;
        for (let i = 0; i < 4; i++) {
          const next = rotatePasteAim(aim);
          expect(next.lastPaste).toBe(aim.lastPaste);
          expect(Object.isFrozen(next)).toBe(true);
          aim = next;
        }
        expect(aim).toEqual(initial);
        expect(recordPaste(aim, anchor, tick + 1).turn).toBe(initial.turn);
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
        expect(isRepeat(initial, anchor, tick, window)).toBe(false);
        const flow = recordPaste(initial, anchor, tick);
        expect(flow).toEqual({
          kind: "pasteAim",
          turn: 0,
          lastPaste: { anchor, tick },
        });
        expect(initial).toEqual({ kind: "pasteAim", turn: 0 });
        expect(Object.isFrozen(flow)).toBe(true);
        expect(Object.isFrozen(flow.lastPaste)).toBe(true);
        expect(Object.isFrozen(flow.lastPaste?.anchor)).toBe(true);
        expect(flow.lastPaste?.anchor).not.toBe(anchor);
        expect(isRepeat(flow, { ...anchor }, tick + window - 1, window)).toBe(
          true,
        );
        expect(isRepeat(flow, anchor, tick + window, window)).toBe(false);
        expect(isRepeat(flow, anchor, tick + window + 1, window)).toBe(false);
        for (const axis of ["x", "y", "z"] as const)
          expect(
            isRepeat(
              flow,
              { ...anchor, [axis]: anchor[axis] + 1 },
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
