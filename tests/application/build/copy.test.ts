import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseCopy } from "../../../src/application/build/chooseCopy";
import { ConfirmCopyHeight } from "../../../src/application/build/confirmCopyHeight";
import { ConfirmHeighted } from "../../../src/application/build/confirmHeighted";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CopySelection } from "../../../src/application/build/copySelection";
import { EditJobs } from "../../../src/application/build/editJobs";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, volume } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import {
  type BuildFlow,
  chooseHeighted,
  setHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { shapeOf } from "../../../src/domain/build/shape/shape";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { copyVolume } from "../../../src/domain/build/volume/copy";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";

const playerId = asPlayerId("alex");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const side = fc.integer({ min: 1, max: 5 });
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
  return {
    repo,
    world,
    feedback,
    session,
    choose: new ChooseCopy(repo, new CopyBox(repo, world, feedback), feedback),
    confirm: new ConfirmCopyHeight(
      repo,
      new CopyBox(repo, world, feedback),
      feedback,
    ),
  };
}
function endpoint(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  dimensionId = overworld,
) {
  return tapAir(tapBlock({ kind: "idle" }, dimensionId, from, stone), to);
}

it("copies a base grown through any allowed height without beginning an edit", () => {
  fc.assert(
    fc.property(
      cell,
      side,
      side,
      fc.nat(),
      fc.boolean(),
      (from, dx, dz, seed, reverse) => {
        const e = setup();
        const to = { x: from.x + dx, y: from.y, z: from.z + dz };
        const base = boxOf(from, to);
        const height =
          1 + (seed % copyVolume.maxHeight(base, BUILD_SPEC.worldTopY));
        e.session.setFlow(
          endpoint(reverse ? to : from, reverse ? from : to, nether),
        );
        e.choose.execute({ playerId });
        expect(e.session.flow).toEqual(
          chooseHeighted(
            endpoint(reverse ? to : from, reverse ? from : to, nether),
            "copy",
          ),
        );
        expect(e.session.clipboard).toBeUndefined();
        e.session.setFlow(setHeight(e.session.flow, height));
        const begin = vi.spyOn(e.session, "beginEdit");
        const read = vi.spyOn(e.world, "stateAt");
        e.world.put(base.min, stone);
        e.confirm.execute({ playerId });
        const box = {
          min: base.min,
          max: { ...base.max, y: base.min.y + height - 1 },
        };
        expect(e.session.confirmedBox).toEqual({ dimensionId: nether, box });
        expect(e.session.flow).toEqual({ kind: "pasteAim", skipAir: false });
        expect(e.session.clipboard?.size).toEqual({
          x: dx + 1,
          y: height,
          z: dz + 1,
        });
        expect(e.session.clipboard?.cells).toHaveLength(volume(box));
        expect(e.session.clipboard?.cells[0]?.state).toEqual(stone);
        expect(
          read.mock.calls.every(([dimensionId]) => dimensionId === nether),
        ).toBe(true);
        expect(e.feedback.messages.at(-1)).toEqual({
          message: "copied",
          count: volume(box),
        });
        expect(begin).not.toHaveBeenCalled();
        expect(e.session.isEditing).toBe(false);
        expect(e.world.writes).toBe(0);
      },
    ),
  );
});

it("copies other endpoint shapes directly and confirms their bounding box", () => {
  fc.assert(
    fc.property(cell, offset, fc.boolean(), (from, delta, reverse) => {
      const e = setup();
      const to = {
        x: from.x + delta.x,
        y: from.y + delta.y,
        z: from.z + delta.z,
      };
      const shape = shapeOf(from, to);
      fc.pre(shape.kind !== "rect" || shape.flat !== "y");
      e.session.setFlow(endpoint(reverse ? to : from, reverse ? from : to));
      const begin = vi.spyOn(e.session, "beginEdit");
      e.choose.execute({ playerId });
      const box = boxOf(from, to);
      expect(e.session.flow).toEqual({ kind: "pasteAim", skipAir: false });
      expect(e.session.confirmedBox).toEqual({ dimensionId: overworld, box });
      expect(e.session.clipboard?.cells).toHaveLength(volume(box));
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
      fc.constantFrom("direct", "height", "selection"),
      (from, extra, path) => {
        const e = setup();
        const previous = boxOf(from, from);
        const clip = clipboardOf(previous, () => stone);
        e.session.setClipboard(clip);
        e.session.confirmBox(nether, previous);
        const size = BUILD_SPEC.maxCopyVolume + extra;
        if (path === "height") {
          e.session.setFlow({
            kind: "heightStep",
            dimensionId: overworld,
            base: previous,
            from,
            heightedKind: "copy",
            previous: size,
            heightLocked: false,
            material: stone,
          });
        } else {
          const box = boxOf(from, { ...from, x: from.x + size - 1 });
          if (path === "selection") e.session.confirmBox(overworld, box);
          else e.session.setFlow(endpoint(box.min, box.max));
        }
        const flow = e.session.flow;
        const confirmed = e.session.confirmedBox;
        const read = vi.spyOn(e.world, "stateAt");
        if (path === "height") e.confirm.execute({ playerId });
        else if (path === "direct") e.choose.execute({ playerId });
        else
          new CopySelection(
            e.repo,
            new CopyBox(e.repo, e.world, e.feedback),
            e.feedback,
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

it("refuses the wrong copy stage and refuses Copy in the placement confirm", () => {
  fc.assert(
    fc.property(cell, (from) => {
      const e = setup();
      const horizontal = endpoint(from, {
        x: from.x + 1,
        y: from.y,
        z: from.z + 1,
      });
      const copy = chooseHeighted(horizontal, "copy");
      const roof = chooseHeighted(horizontal, "gable");
      const point = tapBlock({ kind: "idle" }, overworld, from, stone);
      for (const flow of [
        { kind: "idle" },
        point,
        horizontal,
        copy,
        roof,
        { kind: "pasteAim", skipAir: false },
      ] as BuildFlow[]) {
        for (const useCase of [e.choose, e.confirm]) {
          if (
            useCase === e.choose
              ? flow.kind === "endpoint"
              : flow.kind === "heightStep" && flow.heightedKind === "copy"
          )
            continue;
          e.session.setFlow(flow);
          useCase.execute({ playerId });
          expect(e.feedback.messages.at(-1)?.message).toBe("noSelection");
          expect(e.session.flow).toBe(flow);
          expect(e.session.clipboard).toBeUndefined();
        }
      }
      e.session.setFlow(copy);
      const jobs = new EditJobs(e.repo, e.world, e.feedback);
      const start = vi.spyOn(jobs, "start");
      const begin = vi.spyOn(e.session, "beginEdit");
      new ConfirmHeighted(e.repo, e.feedback, jobs).execute({
        playerId,
        fill: "fill",
      });
      expect(e.feedback.messages.at(-1)?.message).toBe("noSelection");
      expect(e.session.flow).toBe(copy);
      expect(start).not.toHaveBeenCalled();
      expect(begin).not.toHaveBeenCalled();
    }),
  );
});

it("utility Copy resets paste settings in every prior flow and an oversized copy preserves them", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), fc.nat(), (from, skipAir, tick) => {
      const e = setup();
      const box = boxOf(from, { ...from, x: from.x + 1, z: from.z + 1 });
      const selected = endpoint(box.min, box.max);
      const flows: BuildFlow[] = [
        { kind: "idle" },
        tapBlock({ kind: "idle" }, overworld, from, stone),
        selected,
        chooseHeighted(selected, "copy"),
        chooseHeighted(selected, "hip"),
        { kind: "pasteAim", skipAir, lastPaste: { anchor: from, tick } },
      ];
      const copy = new CopySelection(
        e.repo,
        new CopyBox(e.repo, e.world, e.feedback),
        e.feedback,
      );
      const old = clipboardOf(boxOf(from, from), () => stone);
      for (const flow of flows) {
        e.session.confirmBox(overworld, box);
        e.session.setClipboard(old);
        e.session.setFlow(flow);
        copy.execute({ playerId });
        expect(e.session.flow).toEqual({ kind: "pasteAim", skipAir: false });
        expect(e.session.clipboard).not.toBe(old);
        expect(e.session.clipboard).toEqual(
          clipboardOf(box, (at) => e.world.stateAt(overworld, at)),
        );
        const oversized = boxOf(from, {
          ...from,
          x: from.x + BUILD_SPEC.maxCopyVolume,
        });
        e.session.confirmBox(overworld, oversized);
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
