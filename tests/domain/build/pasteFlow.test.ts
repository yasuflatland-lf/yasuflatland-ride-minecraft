import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import {
  type BuildFlow,
  chooseHeighted,
  isRepeat,
  recordPaste,
  startPaste,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { utilityMenu } from "../../../src/domain/build/flow/menu";
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
        const initial = startPaste({ kind: "idle" }, skipAir);
        expect(isRepeat(initial, anchor, tick, window)).toBe(false);
        const flow = recordPaste(initial, anchor, tick);
        expect(flow).toEqual({
          kind: "pasteAim",
          skipAir,
          lastPaste: { anchor, tick },
        });
        expect(initial).toEqual({ kind: "pasteAim", skipAir });
        expect(Object.isFrozen(flow)).toBe(true);
        if (flow.kind !== "pasteAim") throw new Error("Expected paste aiming");
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

it("offers only undo and stop while pasting, and never stop in other flows", () => {
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
          startPaste(idle, false),
        ]) {
          session.setFlow(flow);
          const entries = utilityMenu(session).map(({ id }) => id);
          if (flow.kind === "pasteAim")
            expect(entries).toEqual([
              ...(history ? ["undo"] : []),
              "stopPaste",
            ]);
          else {
            expect(entries).not.toContain("stopPaste");
            expect(recordPaste(flow, at, 0)).toBe(flow);
            expect(isRepeat(flow, at, 0, 10)).toBe(false);
          }
        }
      },
    ),
  );
});
