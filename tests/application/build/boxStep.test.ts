import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CopySelection } from "../../../src/application/build/copySelection";
import { CutBox } from "../../../src/application/build/cutBox";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, volume } from "../../../src/domain/build/box";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/heightFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { confirmEndpointHeight } from "../../support/buildSelection";
import {
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const offset = fc.record({
  x: fc.integer({ min: 0, max: 5 }),
  y: fc.integer({ min: 0, max: 5 }),
  z: fc.integer({ min: 0, max: 5 }),
});
function setup() {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const session = repo.getOrCreate(playerId);
  const actions = {
    copy: new CopyBox(repo, new FakeStructureStore(), feedback),
    cut: new CutBox(repo, world, new FakeStructureStore(), feedback, {
      warn: () => {},
    }),
  };
  return {
    repo,
    world,
    feedback,
    session,
    choose: new ChooseBoxStep(repo, actions, feedback, {
      facingOf: () => "east",
    }),
  };
}
function endpoint(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  dimensionId = overworld,
) {
  return confirmEndpointHeight(
    tapAir(tapBlock({ kind: "idle" }, dimensionId, from, stone), to),
  );
}

it("copies every selected shape directly and confirms their bounding box", () => {
  fc.assert(
    fc.property(cell, offset, fc.boolean(), (from, delta, reverse) => {
      const e = setup();
      const to = {
        x: from.x + delta.x,
        y: from.y + delta.y,
        z: from.z + delta.z,
      };
      e.session.setFlow(endpoint(reverse ? to : from, reverse ? from : to));
      const begin = vi.spyOn(e.session, "beginEdit");
      e.choose.execute({ playerId, kind: "copy" });
      const box = boxOf(from, to);
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
      expect(e.session.confirmedBox).toEqual({
        material: stone,
        dimensionId: overworld,
        box,
      });
      expect(e.session.clipboard?.blockCount).toBe(volume(box));
      expect(e.session.clipboard?.contents.kind).toBe("structure");
      expect(e.feedback.messages.at(-1)).toEqual({
        message: "copied",
        count: volume(box),
      });
      expect(begin).not.toHaveBeenCalled();
    }),
  );
});

it("preserves the clipboard, confirmed box, and flow on every over-limit copy path", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 1, max: 100 }),
      fc.constantFrom("direct", "selection"),
      (from, extra, path) => {
        const e = setup();
        const previous = boxOf(from, from);
        const clip = structureClipboard(previous, () => stone);
        holdClipboard(e.session, clip);
        e.session.confirmBox(selectionOf(nether, previous, stone));
        const size = BUILD_SPEC.maxCopyVolume + extra;
        const box = boxOf(from, { ...from, x: from.x + size - 1 });
        if (path === "selection")
          e.session.confirmBox(selectionOf(overworld, box, stone));
        else e.session.setFlow(endpoint(box.min, box.max));
        const flow = e.session.flow;
        const confirmed = e.session.confirmedBox;
        const read = vi.spyOn(e.world, "stateAt");
        if (path === "direct") e.choose.execute({ playerId, kind: "copy" });
        else
          new CopySelection(
            e.repo,
            new CopyBox(e.repo, new FakeStructureStore(), e.feedback),
            e.feedback,
            { facingOf: () => "east" },
          ).execute({ playerId });
        expect(e.session.clipboard).toBe(clip);
        expect(e.session.confirmedBox).toBe(confirmed);
        expect(e.session.flow).toBe(flow);
        expect(read).not.toHaveBeenCalled();
        expect(e.feedback.messages.at(-1)).toEqual({
          message: "tooLarge",
          count: size,
        });
      },
    ),
  );
});

it("refuses Copy when the selection is not confirmed", () => {
  fc.assert(
    fc.property(cell, (from) => {
      const e = setup();
      const to = { x: from.x + 1, y: from.y, z: from.z + 1 };
      const point = tapBlock({ kind: "idle" }, overworld, from, stone);
      const baseHeight = tapAir(point, to);
      const roof = chooseHeighted(endpoint(from, to), "gable");
      for (const flow of [
        { kind: "idle" },
        point,
        baseHeight,
        roof,
        { kind: "pasteAim", manualTurn: 0 },
      ] as BuildFlow[]) {
        e.session.setFlow(flow);
        e.choose.execute({ playerId, kind: "copy" });
        expect(e.feedback.messages.at(-1)?.message).toBe("noSelection");
        expect(e.session.flow).toBe(flow);
        expect(e.session.clipboard).toBeUndefined();
      }
    }),
  );
});

it("utility Copy enters paste aiming from every prior flow and an oversized copy preserves them", () => {
  fc.assert(
    fc.property(cell, (from) => {
      const e = setup();
      const box = boxOf(from, { ...from, x: from.x + 1, z: from.z + 1 });
      const selected = endpoint(box.min, box.max);
      const flows: BuildFlow[] = [
        { kind: "idle" },
        tapBlock({ kind: "idle" }, overworld, from, stone),
        selected,
        chooseHeighted(selected, "hip"),
        {
          kind: "pasteAim",
          manualTurn: 1,
          facing: "north",
        },
      ];
      const copy = new CopySelection(
        e.repo,
        new CopyBox(e.repo, new FakeStructureStore(), e.feedback),
        e.feedback,
        { facingOf: () => "east" },
      );
      const old = structureClipboard(boxOf(from, from), () => stone);
      for (const flow of flows) {
        e.session.confirmBox(selectionOf(overworld, box, stone));
        holdClipboard(e.session, old);
        e.session.setFlow(flow);
        copy.execute({ playerId });
        expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
        expect(e.session.clipboard).not.toBe(old);
        expect(e.session.clipboard).toMatchObject({
          size: { x: 2, y: 1, z: 2 },
          blockCount: volume(box),
          facing: "east",
          contents: { kind: "structure" },
        });
        const oversized = boxOf(from, {
          ...from,
          x: from.x + BUILD_SPEC.maxCopyVolume,
        });
        e.session.confirmBox(selectionOf(overworld, oversized, stone));
        e.session.setFlow(flow);
        const clipboard = e.session.clipboard;
        const confirmed = e.session.confirmedBox;
        copy.execute({ playerId });
        expect(e.session.flow).toBe(flow);
        expect(e.session.clipboard).toBe(clipboard);
        expect(e.session.confirmedBox).toBe(confirmed);
      }
    }),
  );
});
