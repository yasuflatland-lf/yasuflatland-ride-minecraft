import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
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
  toggleSkipAir,
} from "../../../src/domain/build/flow/paste";
import { BuildSession } from "../../../src/domain/build/session";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimensionId = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone");

it("records an immutable paste and suppresses only the same anchor within the window", () => {
  fc.assert(
    fc.property(
      cell,
      fc.nat({ max: 10000 }),
      fc.integer({ min: 1, max: 100 }),
      fc.boolean(),
      (anchor, tick, window, skipAir) => {
        const initial = beginPasteAim(skipAir);
        expect(Object.isFrozen(initial)).toBe(true);
        expect(isRepeat(initial, anchor, tick, window)).toBe(false);
        const flow = recordPaste(initial, anchor, tick);
        expect(flow).toEqual({
          kind: "pasteAim",
          skipAir,
          lastPaste: { anchor, tick },
        });
        expect(initial).toEqual({ kind: "pasteAim", skipAir });
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
        if (clipboard) session.setClipboard(clipboardOf(box, () => stone));
        if (history)
          session.finishEdit(
            {
              dimensionId,
              changes: [{ cell: at, before: stone, after: stone }],
            },
            false,
          );
        const idle: BuildFlow = { kind: "idle" };
        const first = tapBlock(idle, dimensionId, at, stone);
        const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
        const height = chooseHeighted(endpoint, "gable");
        for (const flow of [
          idle,
          first,
          endpoint,
          height,
          beginPasteAim(false),
        ]) {
          session.setFlow(flow);
          const entries = utilityMenu(session).map(({ id }) => id);
          expect(entries).not.toContain("endPaste");
          expect(entries).not.toContain("paste");
          expect(
            pasteMenu({
              hasHistory: session.hasHistory,
              skipAir: session.flow.kind === "pasteAim" && session.flow.skipAir,
            }).map(({ id }) => id),
          ).toEqual([
            ...(history ? ["undo"] : []),
            "skipAir",
            "newCopy",
            "endPaste",
          ]);
        }
      },
    ),
  );
});

it("toggles immutably, preserves the repeat record, and toggles twice to identity", () => {
  fc.assert(
    fc.property(
      cell,
      fc.nat(),
      fc.boolean(),
      fc.boolean(),
      (anchor, tick, skipAir, history) => {
        const initial = beginPasteAim(skipAir);
        const flow = history ? recordPaste(initial, anchor, tick) : initial;
        const toggled = toggleSkipAir(flow);
        expect(toggled.skipAir).toBe(!skipAir);
        expect(toggled.lastPaste).toBe(flow.lastPaste);
        expect(Object.isFrozen(toggled)).toBe(true);
        expect(flow.skipAir).toBe(skipAir);
        expect(toggleSkipAir(toggled)).toEqual(flow);
        expect(
          pasteMenu({ hasHistory: history, skipAir: toggled.skipAir }),
        ).toEqual([
          ...(history ? [{ id: "undo" }] : []),
          { id: "skipAir", on: !skipAir },
          { id: "newCopy" },
          { id: "endPaste" },
        ]);
      },
    ),
  );
});
