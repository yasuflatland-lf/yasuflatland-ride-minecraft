import fc from "fast-check";
import { expect, it } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { ConfirmBoxStep } from "../../../src/application/build/confirmBoxStep";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateBoxAction } from "../../../src/application/build/rotateBoxAction";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { selectionBoxOf, setHeight } from "../../../src/domain/build/flow/flow";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

it("rotates the shared height selection and preserves it on refusal", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 8 }),
      fc.integer({ min: 2, max: 8 }),
      fc.integer({ min: 1, max: 8 }),
      fc.boolean(),
      (x, z, height, blocked) => {
        const playerId = asPlayerId("builder");
        const repo = new FakeSessions();
        const world = new FakeWorld();
        const feedback = new FakeFeedback();
        const session = repo.getOrCreate(playerId);
        const material = blockStateOf("minecraft:stone");
        const min = { x: 0, y: 60, z: 0 };
        session.setFlow({
          kind: "selected",
          menuLevel: "root",
          selection: selectionOf(
            overworld,
            boxOf(min, { x: x - 1, y: 60, z: z - 1 }),
            material,
          ),
          from: min,
          to: { x: x - 1, y: 60, z: z - 1 },
        });
        const rotate = new RotateBoxAction(
          repo,
          new RotateBox(
            repo,
            world,
            new FakeBuildPlayers(),
            new FakeStructureStore(world),
            feedback,
            { warn: () => {} },
          ),
        );
        const unused = {
          execute: () => {
            throw new Error("wrong box action");
          },
        };
        const actions = { rotate, copy: unused, cut: unused };
        new ChooseBoxStep(repo, actions, feedback, {
          facingOf: () => "east",
        }).execute({
          playerId,
          kind: "rotate",
        });
        expect(session.flow).toMatchObject({
          kind: "heightStep",
          heightedKind: "rotate",
        });
        session.setFlow(setHeight(session.flow, height));
        const before = session.flow;
        const box = { min, max: { x: x - 1, y: 60 + height - 1, z: z - 1 } };
        if (blocked) world.mayEdit = () => false;
        new ConfirmBoxStep(repo, actions, feedback, {
          facingOf: () => "east",
        }).execute({ playerId });
        if (blocked) {
          expect(session.flow).toBe(before);
          expect(session.hasHistory).toBe(false);
          expect(feedback.messages.at(-1)?.message).toBe("rotateBlocked");
        } else {
          expect(selectionBoxOf(session.flow)).toEqual(
            planRotationAboutCenter(box).target,
          );
          expect(session.flow).toMatchObject({
            kind: "rotateMode",
            turn: 1,
            selection: { dimensionId: overworld, material },
          });
          expect(session.hasHistory).toBe(true);
          expect(feedback.messages.at(-1)?.message).toBe("rotateDone");
        }
      },
    ),
  );
});

it("enters rotate mode after an immediate rotation and restores a refused endpoint", () => {
  fc.assert(
    fc.property(fc.boolean(), (blocked) => {
      const repo = new FakeSessions();
      const world = new FakeWorld();
      const playerId = asPlayerId("builder");
      const session = repo.getOrCreate(playerId);
      const box = { min: { x: 0, y: 60, z: 0 }, max: { x: 2, y: 62, z: 4 } };
      session.setFlow({
        kind: "selected",
        menuLevel: "root",
        selection: selectionOf(overworld, box, blockStateOf("minecraft:stone")),
        from: box.min,
        to: box.max,
      });
      const before = session.flow;
      if (blocked) world.mayEdit = () => false;
      const action = new RotateBoxAction(
        repo,
        new RotateBox(
          repo,
          world,
          new FakeBuildPlayers(),
          new FakeStructureStore(world),
          new FakeFeedback(),
          { warn: () => {} },
        ),
      );
      expect(
        action.execute({
          playerId,
          selection: selectionOf(overworld, box, AIR),
          facing: "east",
        }),
      ).toBe(!blocked);
      if (blocked) expect(session.flow).toBe(before);
      else
        expect(session.flow).toMatchObject({
          kind: "rotateMode",
          turn: 1,
          selection: { box: planRotationAboutCenter(box).target },
        });
    }),
  );
});
