import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  aimedPasteTarget,
  clipboardOf,
  type Face,
} from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { clipboardCells, holdClipboard } from "../../support/buildClipboard";
import { undoRecord } from "../../support/undoRecord";
import {
  cellKey,
  FakeAimReader,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
} from "./fakes";

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const face = fc.constantFrom<Face>(
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
);
const tick = fc.integer({ min: 0, max: 10000 });

function setup(
  block: { x: number; y: number; z: number },
  face: Face,
  tick: number,
  skipAir = false,
) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    { warn: () => {} },
    new FakeBuildPlayers(),
  );
  const paste = new PasteAt(repo, world, feedback, jobs);
  const press = new PressPasteAim(repo, paste, feedback);
  const clipboard = clipboardOf(
    boxOf(block, { ...block, x: block.x + 1 }),
    () => stone,
  );
  holdClipboard(session, clipboard);
  session.setFlow({ kind: "pasteAim", skipAir });
  const aim = new FakeAimReader();
  aim.target = {
    ray: { origin: block, direction: { x: 1, y: 0, z: 0 } },
    block: { cell: block, face },
  };
  const target = aimedPasteTarget(clipboard, aim.target);
  if (!target) throw new Error("Expected paste target");
  const start = vi.spyOn(jobs, "start");
  const execute = () => {
    const target = aim.aim(playerId);
    if (!target) throw new Error("Expected aim");
    return press.execute({ playerId, dimensionId: nether, aim: target, tick });
  };
  return {
    repo,
    session,
    world,
    feedback,
    jobs,
    clipboard,
    aim,
    target,
    start,
    execute,
  };
}

it("pastes at the live aimed anchor and creates one undo record", () => {
  fc.assert(
    fc.property(
      cell,
      face,
      tick,
      fc.boolean(),
      (block, face, tick, skipAir) => {
        const e = setup(block, face, tick, skipAir);
        expect(e.execute()).toBe("pasted");
        expect(e.start).toHaveBeenCalledTimes(1);
        expect(e.start.mock.calls[0]?.slice(0, 2)).toEqual([playerId, nether]);
        expect(e.session.flow).toEqual({
          kind: "pasteAim",
          skipAir,
          lastPaste: { anchor: e.target.anchor, tick },
        });
        e.jobs.step();
        for (const { at } of clipboardCells(e.clipboard)) {
          expect(
            e.world.stateAt(nether, {
              x: e.target.anchor.x + at.x,
              y: e.target.anchor.y + at.y,
              z: e.target.anchor.z + at.z,
            }),
          ).toEqual(stone);
        }
        expect(undoRecord(e.session.takeUndo())).toMatchObject({
          dimensionId: nether,
          changes: expect.any(Array),
        });
        expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      },
    ),
  );
});

it("returns menu on air without starting a job or changing the flow", () => {
  fc.assert(
    fc.property(cell, face, tick, (block, face, tick) => {
      const e = setup(block, face, tick);
      const flow = e.session.flow;
      if (!e.aim.target) throw new Error("Expected aim");
      e.aim.target = { ray: e.aim.target.ray };
      expect(e.execute()).toBe("menu");
      expect(e.start).not.toHaveBeenCalled();
      expect(e.session.isEditing).toBe(false);
      expect(e.session.flow).toBe(flow);
    }),
  );
});

it("ignores every selection flow and preserves noClipboard feedback in paste aiming", () => {
  fc.assert(
    fc.property(cell, face, tick, (block, face, tick) => {
      const e = setup(block, face, tick);
      const first = tapBlock({ kind: "idle" }, nether, block, stone);
      const endpoint = tapAir(first, {
        ...block,
        x: block.x + 2,
        z: block.z + 2,
      });
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "copy"),
      ]) {
        e.session.setFlow(flow);
        expect(e.execute()).toBe("ignored");
        expect(e.session.flow).toBe(flow);
      }
      e.repo.remove(playerId);
      expect(e.execute()).toBe("ignored");
      expect(e.repo.get(playerId)).toBeUndefined();
      const empty = e.repo.getOrCreate(playerId);
      empty.setFlow({ kind: "pasteAim", skipAir: false });
      expect(e.execute()).toBe("ignored");
      expect(e.feedback.messages).toEqual([{ message: "noClipboard" }]);
      expect(e.start).not.toHaveBeenCalled();
    }),
  );
});

it("refuses protected volumes and busy jobs without opening the repeat window or queuing", () => {
  fc.assert(
    fc.property(cell, face, tick, fc.boolean(), (block, face, tick, busy) => {
      const e = setup(block, face, tick);
      const flow = e.session.flow;
      if (busy) e.session.beginEdit();
      else
        e.world.protectedCells.add(
          cellKey({ ...e.target.anchor, x: e.target.anchor.x + 1 }),
        );
      expect(e.execute()).toBe("refused");
      expect(e.session.flow).toBe(flow);
      expect(e.feedback.messages.at(-1)?.message).toBe(
        busy ? "busy" : "pasteBlocked",
      );
      expect(e.start).not.toHaveBeenCalled();
      e.jobs.step();
      expect(e.world.writes).toBe(0);
      if (busy)
        e.session.finishEdit({ dimensionId: nether, changes: [] }, "undo");
      else e.world.protectedCells.clear();
      expect(e.execute()).toBe("pasted");
      expect(e.start).toHaveBeenCalledTimes(1);
    }),
  );
});

it("ignores a same-anchor repeat until undo clears the window while keeping clipboard and aiming", () => {
  fc.assert(
    fc.property(
      cell,
      face,
      tick,
      fc.boolean(),
      fc.integer({ min: 0, max: BUILD_SPEC.pasteRepeatTicks - 1 }),
      (block, face, tick, skipAir, delta) => {
        const e = setup(block, face, tick, skipAir);
        expect(e.execute()).toBe("pasted");
        e.jobs.step();
        const flow = e.session.flow;
        const press = new PressPasteAim(
          e.repo,
          new PasteAt(e.repo, e.world, e.feedback, e.jobs),
          e.feedback,
        );
        if (!e.aim.target) throw new Error("Expected aim");
        expect(
          press.execute({
            playerId,
            dimensionId: nether,
            aim: e.aim.target,
            tick: tick + delta,
          }),
        ).toBe("ignored");
        expect(e.session.flow).toBe(flow);
        expect(e.start).toHaveBeenCalledTimes(1);
        new UndoEdit(e.repo, e.feedback, e.jobs).execute({ playerId });
        expect(e.session.flow).toEqual({ kind: "pasteAim", skipAir });
        expect(e.session.clipboard).toBe(e.clipboard);
        e.jobs.step();
        expect(e.world.stateAt(nether, e.target.anchor)).toBe(AIR);
        expect(e.session.hasHistory).toBe(false);
        expect(e.execute()).toBe("pasted");
        e.jobs.step();
        expect(e.start).toHaveBeenCalledTimes(3);
        expect(undoRecord(e.session.takeUndo())).toMatchObject({
          dimensionId: nether,
        });
        expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      },
    ),
  );
});
