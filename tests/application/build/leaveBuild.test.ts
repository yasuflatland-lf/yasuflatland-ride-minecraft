import fc from "fast-check";
import { expect, it } from "vitest";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { beginRotateMode } from "../../../src/domain/build/flow/rotateMode";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeSessions, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

it("ends rotate mode on an item switch while retaining history", () => {
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
      session.setFlow(beginRotateMode(overworld, boxOf(cell, cell), stone, 1));
      new LeaveBuild(repo, new FakeStructureStore()).execute(id);
      expect(session.flow).toEqual({ kind: "idle" });
      expect(session.takeUndo()).toEqual({ kind: "cells", record: history });
    }),
  );
});
