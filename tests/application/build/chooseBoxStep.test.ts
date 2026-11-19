import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { ConfirmBoxStep } from "../../../src/application/build/confirmBoxStep";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { setHeight } from "../../../src/domain/build/flow/flow";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, FakeWorld, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

it("retains the choice facing through height changes and a different confirmation gaze", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACINGS),
      fc.constantFrom("copy", "cut"),
      fc.integer({ min: 1, max: 8 }),
      (facing, kind, height) => {
        const repo = new FakeSessions();
        const feedback = new FakeFeedback();
        const structures = new FakeStructureStore();
        const actions = {
          copy: new CopyBox(repo, structures, feedback),
          cut: new CutBox(repo, new FakeWorld(), structures, feedback, {
            warn: () => {},
          }),
          rotate: { execute: () => true },
        };
        const playerId = asPlayerId("builder");
        const session = repo.getOrCreate(playerId);
        const reader = {
          facingOf: vi
            .fn()
            .mockReturnValueOnce(facing)
            .mockReturnValue(FACINGS[(FACINGS.indexOf(facing) + 1) % 4]),
        };
        session.setFlow({
          kind: "selected",
          menuLevel: "root",
          selection: selectionOf(
            overworld,
            boxOf({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }),
            blockStateOf("minecraft:stone"),
          ),
          from: { x: 0, y: 0, z: 0 },
          to: { x: 2, y: 0, z: 2 },
        });
        new ChooseBoxStep(repo, actions, feedback, reader).execute({
          playerId,
          kind,
        });
        session.setFlow(setHeight(session.flow, height));
        new ConfirmBoxStep(repo, actions, feedback, reader).execute({
          playerId,
        });
        expect(session.clipboard?.facing).toBe(facing);
        expect(reader.facingOf).toHaveBeenCalledExactlyOnceWith(playerId);
      },
    ),
  );
});
