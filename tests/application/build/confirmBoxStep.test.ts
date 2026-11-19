import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ConfirmBoxStep } from "../../../src/application/build/confirmBoxStep";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { chooseHeighted } from "../../../src/domain/build/flow/flow";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, FakeWorld, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

it("reads facing at confirmation only when the height step has none", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FACINGS), (facing) => {
      const repo = new FakeSessions();
      const feedback = new FakeFeedback();
      const structures = new FakeStructureStore();
      const actions = {
        copy: new CopyBox(repo, structures, feedback),
        cut: new CutBox(repo, new FakeWorld(), structures, feedback, {
          warn: () => {},
        }),
      };
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
          "copy",
        ),
      );
      const reader = { facingOf: vi.fn(() => facing) };
      new ConfirmBoxStep(repo, actions, feedback, reader).execute({ playerId });
      expect(session.clipboard?.facing).toBe(facing);
      expect(reader.facingOf).toHaveBeenCalledExactlyOnceWith(playerId);
    }),
  );
});
