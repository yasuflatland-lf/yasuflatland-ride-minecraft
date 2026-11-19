import fc from "fast-check";
import { expect, it } from "vitest";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CopySelection } from "../../../src/application/build/copySelection";
import { AIR } from "../../../src/domain/build/blockState";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

it("stores the passed facing in the clipboard", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACINGS),
      fc.integer({ min: 1, max: 5 }),
      (facing, side) => {
        const repo = new FakeSessions();
        const structures = new FakeStructureStore();
        const feedback = new FakeFeedback();
        const playerId = asPlayerId("builder");
        const box = {
          min: { x: 0, y: 0, z: 0 },
          max: { x: side, y: side, z: side },
        };
        const action = new CopySelection(
          repo,
          new CopyBox(repo, structures, feedback),
          feedback,
          { facingOf: () => facing },
        );
        repo.getOrCreate(playerId).confirmBox(selectionOf(overworld, box, AIR));
        action.execute({ playerId });
        expect(repo.get(playerId)?.clipboard?.facing).toBe(facing);
      },
    ),
  );
});
