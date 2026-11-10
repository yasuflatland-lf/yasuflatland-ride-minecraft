import fc from "fast-check";
import { expect, it } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { NewCopy } from "../../../src/application/build/newCopy";
import { SetPoint } from "../../../src/application/build/setPoint";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";
import { FakeFeedback, FakeSessions, FakeWorld, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("builder");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cellArb = fc.record({ x: coordinate, y: coordinate, z: coordinate });

function setup(from: { x: number; y: number; z: number }) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const box = boxOf(from, from);
  const old = structureClipboard(box, () => stone);
  session.completeCopy(overworld, box, old);
  session.setFlow({
    kind: "pasteAim",
    lastPaste: { anchor: from, tick: 10 },
  });
  const newCopy = new NewCopy(repo);
  const chooseBoxStep = new ChooseBoxStep(
    repo,
    {
      copy: new CopyBox(repo, new FakeStructureStore(), feedback),
      cut: new CutBox(repo, world, new FakeStructureStore(), feedback, {
        warn: () => {},
      }),
    },
    feedback,
  );
  return { repo, session, world, feedback, old, newCopy, chooseBoxStep };
}

it("starts a normal selection with the old clipboard, then replaces it on Copy", () => {
  fc.assert(
    fc.property(cellArb, fc.integer({ min: 1, max: 8 }), (from, length) => {
      const e = setup(from);
      e.newCopy.execute(playerId);
      expect(e.session.flow).toEqual({ kind: "idle" });
      expect(e.session.confirmedBox).toBeUndefined();
      expect(e.session.clipboard).toBe(e.old);
      const to = { ...from, x: from.x + length };
      e.world.put(from, stone);
      const points = new SetPoint(e.repo, e.world, e.feedback);
      points.execute({ playerId, dimensionId: overworld, cell: from });
      const first = tapBlock({ kind: "idle" }, overworld, from, stone);
      expect(e.session.flow).toEqual(first);
      expect(e.session.clipboard).toBe(e.old);
      points.execute({ playerId, dimensionId: overworld, cell: to });
      expect(e.session.flow).toEqual(tapBlock(first, overworld, to, stone));
      e.chooseBoxStep.execute({ playerId, kind: "copy" });
      expect(e.session.clipboard).not.toBe(e.old);
      expect(e.session.clipboard).toMatchObject({
        size: { x: length + 1, y: 1, z: 1 },
        blockCount: length + 1,
        contents: { kind: "structure" },
      });
      expect(e.session.flow).toEqual({ kind: "pasteAim" });
    }),
  );
});

it("keeps the old clipboard and selection on an oversized new copy, and keeps it on cancel or clear", () => {
  fc.assert(
    fc.property(cellArb, fc.integer({ min: 1, max: 100 }), (from, extra) => {
      const e = setup(from);
      e.newCopy.execute(playerId);
      const selected = tapAir(
        tapBlock(e.session.flow, overworld, from, stone),
        { ...from, x: from.x + BUILD_SPEC.maxCopyVolume + extra },
      );
      e.session.setFlow(selected);
      e.chooseBoxStep.execute({ playerId, kind: "copy" });
      expect(e.feedback.messages.at(-1)?.message).toBe("tooLarge");
      expect(e.session.flow).toBe(selected);
      expect(e.session.clipboard).toBe(e.old);
      new CancelFlow(e.repo).backToAiming({ playerId });
      expect(e.session.flow.kind).toBe("point1");
      expect(e.session.clipboard).toBe(e.old);
      new ClearSelection(e.repo, e.feedback).execute({ playerId });
      expect(e.session.flow).toEqual({ kind: "idle" });
      expect(e.session.clipboard).toBe(e.old);
    }),
  );
});

it("acts only in paste aiming and never creates a missing session", () => {
  fc.assert(
    fc.property(cellArb, (from) => {
      const e = setup(from);
      e.newCopy.execute(asPlayerId("absent"));
      expect(e.repo.get(asPlayerId("absent"))).toBeUndefined();
      const first = tapBlock({ kind: "idle" }, overworld, from, stone);
      const endpoint = tapAir(first, { ...from, x: from.x + 1, z: from.z + 1 });
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "copy"),
      ]) {
        e.session.setFlow(flow);
        const confirmed = e.session.confirmedBox;
        e.newCopy.execute(playerId);
        expect(e.session.flow).toBe(flow);
        expect(e.session.confirmedBox).toBe(confirmed);
        expect(e.session.clipboard).toBe(e.old);
      }
    }),
  );
});
