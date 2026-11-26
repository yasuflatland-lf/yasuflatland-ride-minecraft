import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { tappedSelection } from "../../support/buildSelection";
import { FakeFeedback, FakeSessions, FakeWorld, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

it("captures the selected layers and choice facing immediately for Copy and Cut", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACINGS),
      fc.constantFrom("copy", "cut"),
      fc.integer({ min: 1, max: 8 }),
      (facing, kind, height) => {
        const feedback = new FakeFeedback();
        const structures = new FakeStructureStore();
        const repo = new FakeSessions(structures);
        const actions = {
          copy: new CopyBox(repo, structures, feedback),
          cut: new CutBox(repo, new FakeWorld(), structures, feedback, {
            warn: () => {},
          }),
        };
        const playerId = asPlayerId("builder");
        const session = repo.getOrCreate(playerId);
        const reader = {
          facingOf: vi
            .fn()
            .mockReturnValueOnce(facing)
            .mockReturnValue(FACINGS[(FACINGS.indexOf(facing) + 1) % 4]),
        };
        session.setFlowForTest({
          kind: "selected",
          menuLevel: "root",
          ...tappedSelection(
            selectionOf(
              overworld,
              boxOf(
                cellOf({ x: 0, y: 0, z: 0 }),
                cellOf({ x: 2, y: height - 1, z: 2 }),
              ),
              blockStateOf("minecraft:stone"),
            ),
            cellOf({ x: 2, y: 0, z: 0 }),
            cellOf({ x: 0, y: 0, z: 2 }),
          ),
        });
        new ChooseBoxStep(repo, actions, feedback, reader).execute({
          playerId,
          kind,
        });
        expect(session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
        expect(session.clipboard?.size).toEqual({ x: 3, y: height, z: 3 });
        expect(session.clipboard?.anchor).toEqual({ x: "max", z: "min" });
        expect(session.clipboard?.facing).toBe(facing);
        expect(reader.facingOf).toHaveBeenCalledExactlyOnceWith(playerId);
      },
    ),
  );
});
