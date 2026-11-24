import fc from "fast-check";
import { expect, it } from "vitest";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { tappedSelection } from "../../support/buildSelection";
import { FakeSessions, FakeTapTargets, overworld } from "./fakes";

it("clears the selection on an item switch while retaining history", () => {
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), (x) => {
      const repo = new FakeSessions();
      const id = asPlayerId("builder");
      const session = repo.getOrCreate(id);
      const cell = { x, y: 60, z: 0 };
      const stone = blockStateOf("minecraft:stone");
      const history = {
        dimensionId: overworld,
        changes: [
          { cell, before: stone, after: blockStateOf("minecraft:dirt") },
        ],
      };
      session.finishEdit(history, "undoable");
      session.setFlowForTest({
        kind: "selected",
        menuLevel: "root",
        ...tappedSelection(
          selectionOf(overworld, boxOf(cell, cell), stone),
          cell,
          cell,
        ),
      });
      const targets = new FakeTapTargets();
      targets.show(id, { dimensionId: overworld, cell });
      new LeaveBuild(repo, targets).execute(id);
      expect(targets.placements.has(id)).toBe(false);
      expect(session.flow).toEqual({ kind: "idle" });
      expect(session.takeUndo()).toEqual({ kind: "cells", record: history });
    }),
  );
});

it("hides on mode exit when the flow reached idle before the next preview", () => {
  const repo = new FakeSessions();
  const playerId = asPlayerId("builder");
  const targets = new FakeTapTargets();
  const modes = new UpdateBuildModes(repo, new LeaveBuild(repo, targets));
  for (let tick = 0; tick < BUILD_SPEC.modeEnterTicks; tick++)
    modes.execute([{ playerId, held: "wand" }]);
  const session = repo.getOrCreate(playerId);
  const cell = { x: 0, y: 60, z: 0 };
  session.setFlowForTest({
    kind: "point1",
    start: {
      dimensionId: overworld,
      cell,
      material: blockStateOf("minecraft:stone"),
    },
  });
  targets.show(playerId, { dimensionId: overworld, cell });
  session.clearSelection();

  for (let tick = 0; tick < BUILD_SPEC.modeLeaveTicks; tick++)
    modes.execute([{ playerId, held: "none" }]);

  expect(modes.isInBuildMode(playerId)).toBe(false);
  expect(targets.placements.has(playerId)).toBe(false);
});
