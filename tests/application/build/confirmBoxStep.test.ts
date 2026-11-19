import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ConfirmBoxStep } from "../../../src/application/build/confirmBoxStep";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { chooseHeighted } from "../../../src/domain/build/flow/flow";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, overworld } from "./fakes";

it("reads facing at confirmation only when the height step has none", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FACINGS), (facing) => {
      const repo = new FakeSessions();
      const feedback = new FakeFeedback();
      const rotate = { execute: vi.fn(() => true) };
      const actions = { rotate };
      const playerId = asPlayerId("builder");
      const session = repo.getOrCreate(playerId);
      session.setFlow(
        chooseHeighted(
          {
            kind: "selected",
            menuLevel: "root",
            selection: selectionOf(
              overworld,
              boxOf({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }),
              blockStateOf("minecraft:stone"),
            ),
            from: { x: 0, y: 0, z: 0 },
            to: { x: 2, y: 0, z: 2 },
          },
          "rotate",
        ),
      );
      const reader = { facingOf: vi.fn(() => facing) };
      new ConfirmBoxStep(repo, actions, feedback, reader).execute({ playerId });
      expect(rotate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ playerId, facing }),
      );
      expect(reader.facingOf).toHaveBeenCalledExactlyOnceWith(playerId);
    }),
  );
});
