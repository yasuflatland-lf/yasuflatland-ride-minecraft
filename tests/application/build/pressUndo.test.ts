import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { PressUndo } from "../../../src/application/build/pressUndo";
import { StepBackSelection } from "../../../src/application/build/stepBackSelection";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  adjustHeight,
  confirmLiveHeight,
} from "../../../src/domain/build/flow/heightFlow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import {
  chooseStairs,
  fixStairGoal,
} from "../../../src/domain/build/flow/stairFlow";
import {
  stepBackSelection,
  withoutStepBack,
} from "../../../src/domain/build/flow/stepBack";
import { chooseTerrain } from "../../../src/domain/build/flow/terrainFlow";
import { staircaseToward } from "../../../src/domain/build/stairs/staircase";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { NETHER_RANGE, OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import {
  chooseHeightedFlow,
  tapAir,
  tapBlock,
} from "../../support/buildSelection";
import { FakeFeedback, FakeSessions, nether } from "./fakes";

it("routes to edit undo exactly when the flow has no selection step to reverse", () => {
  const coord = fc.integer({ min: -100, max: 100 });
  fc.assert(
    fc.property(
      fc.record({ x: coord, y: coord, z: coord }),
      fc.integer({ min: 1, max: 20 }),
      (cell, size) => {
        const playerId = asPlayerId("p");
        const repo = new FakeSessions();
        const feedback = new FakeFeedback();
        const session = repo.getOrCreate(playerId);
        const point = tapBlock(
          { kind: "idle" },
          nether,
          cell,
          blockStateOf("minecraft:stone"),
          NETHER_RANGE,
        );
        const base = tapAir(point, {
          ...cell,
          x: cell.x + size,
          z: cell.z + size,
        });
        if (base.kind !== "baseHeight") throw new Error("Expected base height");
        const selected = confirmLiveHeight(base);
        const line = tapAir(point, { ...cell, x: cell.x + size });
        const stairAim = chooseStairs(line, "stairs");
        if (stairAim.kind !== "stairAim") throw new Error("Expected stair aim");
        const stairs = staircaseToward(stairAim.row, {
          ...cell,
          y: cell.y + 2,
          z: cell.z + 3,
        });
        if (!stairs) throw new Error("Expected staircase");
        const undo = { execute: vi.fn(() => ({})) };
        const press = new PressUndo(
          new StepBackSelection(repo, feedback),
          undo,
        );
        session.selectPasted(selected.selection);
        const pasted = session.flow;
        // Built and pasted boxes both use confirmBox, which ends endpoint freshness.
        session.confirmBox(selected.selection, "selected", {
          from: cell,
          to: base.to,
        });
        const built = session.flow;
        for (const flow of [
          point,
          base,
          line,
          withoutStepBack(line),
          { kind: "idle" } as const,
          selected,
          pasted,
          built,
          adjustHeight(selected, OVERWORLD_RANGE),
          chooseHeightedFlow(selected, "gable"),
          chooseTerrain(selected, "fillBelow"),
          stairAim,
          fixStairGoal(stairAim, stairs),
          beginPasteAim(),
        ]) {
          undo.execute.mockClear();
          session.setFlow(flow);
          const expected = stepBackSelection(flow);
          expect(press.execute({ playerId })).toBe(
            expected ? "stepped" : "undone",
          );
          expect(undo.execute).toHaveBeenCalledTimes(expected ? 0 : 1);
          if (!expected)
            expect(undo.execute).toHaveBeenCalledWith({ playerId });
        }
      },
    ),
  );
});
