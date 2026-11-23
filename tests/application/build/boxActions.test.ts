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

it("stores the player's facing when copying the confirmed selection", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACINGS),
      fc.integer({ min: 1, max: 5 }),
      (facing, side) => {
        const repo = new FakeSessions();
        const feedback = new FakeFeedback();
        const playerId = asPlayerId("builder");
        const session = repo.getOrCreate(playerId);
        session.confirmBox(
          selectionOf(
            overworld,
            {
              min: { x: 0, y: 0, z: 0 },
              max: { x: side, y: side, z: side },
            },
            AIR,
          ),
        );
        new CopySelection(
          repo,
          new CopyBox(repo, new FakeStructureStore(), feedback),
          feedback,
          {
            facingOf: () => facing,
          },
        ).execute({ playerId });
        expect(session.clipboard?.facing).toBe(facing);
      },
    ),
  );
});
