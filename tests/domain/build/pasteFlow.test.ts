import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  openBuildMenu,
  pasteMenu,
  utilityMenu,
} from "../../../src/domain/build/flow/menu";
import {
  beginPasteAim,
  followFacing,
  type PasteAim,
  rotatePasteAim,
} from "../../../src/domain/build/flow/paste";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import {
  effectiveTurn,
  FACINGS,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { BuildSession } from "../../../src/domain/build/session";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  chooseHeightedFlow,
  confirmEndpointHeight,
  tapAir,
  tapBlock,
} from "../../support/buildSelection";

const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimensionId = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone");

it("offers ordered paste entries independent of history and never paste or endPaste in the utility menu", () => {
  fc.assert(
    fc.property(
      cell,
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (at, confirmed, clipboard, history) => {
        const session = new BuildSession(asPlayerId("p"));
        const box = boxOf(cellOf(at), cellOf(at));
        if (confirmed) session.confirmBox(selectionOf(dimensionId, box, stone));
        if (clipboard)
          holdClipboard(
            session,
            structureClipboard(box, () => stone),
          );
        if (history)
          session.finishEdit(
            {
              dimensionId,
              changes: [{ cell: cellOf(at), before: stone, after: stone }],
            },
            "undoable",
          );
        const idle: BuildFlow = { kind: "idle" };
        const first = tapBlock(idle, dimensionId, cellOf(at), stone);
        const endpoint = confirmEndpointHeight(
          tapAir(first, cellOf({ ...at, x: at.x + 2, z: at.z + 2 })),
        );
        const height = chooseHeightedFlow(endpoint, "gable");
        for (const flow of [
          idle,
          first,
          endpoint,
          openBuildMenu(endpoint),
          height,
          beginPasteAim(),
        ]) {
          session.setFlowForTest(flow);
          const entries = utilityMenu(session).map(({ id }) => id);
          expect(entries).not.toContain("endPaste");
          expect(entries).not.toContain("paste");
          expect(entries.includes("undo")).toBe(history);
          expect(pasteMenu().map(({ id }) => id)).toEqual([
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
        session.setFlowForTest(beginPasteAim());
        session.followPasteFacing(currentFacing);
        expect(session.pasteTurn).toBe(0);
        const box = boxOf(cellOf(at), cellOf(at));
        session.completeCopy(selectionOf(dimensionId, box, stone), {
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

const quarterTurn = fc.constantFrom(0, 1, 2, 3);

it("updates facing without changing the manual turn", () => {
  fc.assert(
    fc.property(
      quarterTurn,
      fc.constantFrom(...FACINGS),
      (manualTurn, facing) => {
        const initial = { ...beginPasteAim(), manualTurn };
        const next = followFacing(initial, facing);
        expect(next).toEqual({ ...initial, facing });
        expect(Object.isFrozen(next)).toBe(true);
        expect(initial).not.toHaveProperty("facing");
      },
    ),
  );
});

it("rotates immutably through four turns while keeping facing", () => {
  fc.assert(
    fc.property(
      quarterTurn,
      fc.constantFrom(...FACINGS),
      (manualTurn, facing) => {
        const initial = { ...beginPasteAim(), manualTurn, facing };
        let aim: PasteAim = initial;
        for (let i = 1; i <= 4; i++) {
          const previous = aim;
          aim = rotatePasteAim(aim);
          expect(aim).not.toBe(previous);
          expect(Object.isFrozen(aim)).toBe(true);
          expect(aim.manualTurn).toBe((manualTurn + i) % 4);
          expect(aim.facing).toBe(facing);
        }
        expect(aim).toEqual(initial);
        expect(initial.manualTurn).toBe(manualTurn);
      },
    ),
  );
});

it("resets manual rotation on a fresh copy and discards it on paste exits", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 1, max: 3 }),
      fc.constantFrom(...FACINGS),
      fc.constantFrom(...FACINGS),
      (at, turns, copied, gaze) => {
        const session = new BuildSession(asPlayerId("p"));
        const box = boxOf(cellOf(at), cellOf(at));
        const clipboard = { ...structureClipboard(box), facing: copied };
        for (const exit of [
          () => session.startNewCopy(),
          () => session.endPasting(),
          () => session.leaveBuildMode(),
        ]) {
          session.completeCopy(selectionOf(dimensionId, box, stone), clipboard);
          session.followPasteFacing(gaze);
          for (let i = 0; i < turns; i++)
            expect(session.rotatePaste()).toBe(true);
          expect(session.pasteTurn).toBe(
            effectiveTurn(copied, gaze, turns as 1 | 2 | 3),
          );
          session.completeCopy(selectionOf(dimensionId, box, stone), clipboard);
          expect(session.flow).toEqual(beginPasteAim());
          session.rotatePaste();
          exit();
          expect(session.flow).toEqual({ kind: "idle" });
          expect(session.pasteTurn).toBe(0);
          session.completeCopy(selectionOf(dimensionId, box, stone), clipboard);
          expect(session.flow).toEqual(beginPasteAim());
        }
        const first = tapBlock(
          { kind: "idle" },
          dimensionId,
          cellOf(at),
          stone,
        );
        const endpoint = confirmEndpointHeight(
          tapAir(first, cellOf({ ...at, x: at.x + 2, z: at.z + 2 })),
        );
        for (const flow of [
          { kind: "idle" } as const,
          first,
          endpoint,
          chooseHeightedFlow(endpoint, "hip"),
        ]) {
          session.setFlowForTest(flow);
          expect(session.rotatePaste()).toBe(false);
          expect(session.flow).toBe(flow);
        }
      },
    ),
  );
});
