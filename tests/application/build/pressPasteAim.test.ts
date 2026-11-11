import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import {
  aimedPasteTarget,
  type Face,
} from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
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
import { FakeStructureStore } from "./fakes/structureStore";

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
  const structures = new FakeStructureStore(world);
  const paste = new PasteAt(
    repo,
    world,
    feedback,
    structures,
    new FakeBuildPlayers(),
  );
  const press = new PressPasteAim(repo, paste, feedback);
  const clipboard = structureClipboard(
    boxOf(block, { ...block, x: block.x + 1 }),
    () => stone,
    structures,
  );
  holdClipboard(session, clipboard);
  session.setFlow({ kind: "pasteAim", turn: 0 });
  const aim = new FakeAimReader();
  aim.target = {
    ray: { origin: block, direction: { x: 1, y: 0, z: 0 } },
    block: { cell: block, face },
  };
  const target = aimedPasteTarget(clipboard, aim.target);
  if (!target) throw new Error("Expected paste target");
  const start = vi.spyOn(structures, "place");
  const execute = (sneaking = false) => {
    const target = aim.aim(playerId);
    if (!target) throw new Error("Expected aim");
    return press.execute({
      playerId,
      dimensionId: nether,
      aim: target,
      tick,
      sneaking,
    });
  };
  return {
    repo,
    structures,
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
    fc.property(cell, face, tick, (block, face, tick) => {
      const e = setup(block, face, tick);
      expect(e.execute()).toBe("pasted");
      expect(e.start).toHaveBeenCalledTimes(1);
      expect(e.start.mock.calls[0]).toEqual([
        e.clipboard.contents.handle,
        nether,
        e.target.anchor,
        0,
      ]);
      expect(e.session.flow).toEqual({
        kind: "pasteAim",
        turn: 0,
        lastPaste: { anchor: e.target.anchor, tick },
      });
      e.jobs.step();
      for (const at of cellsOf(e.target.box))
        expect(e.world.stateAt(nether, at)).toEqual(stone);
      expect(e.session.takeUndo()).toMatchObject({
        kind: "snapshot",
        snapshot: { dimensionId: nether, box: e.target.box },
      });
      expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
    }),
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
      empty.setFlow({ kind: "pasteAim", turn: 0 });
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
      fc.integer({ min: 0, max: BUILD_SPEC.pasteRepeatTicks - 1 }),
      (block, face, tick, delta) => {
        const e = setup(block, face, tick);
        expect(e.execute()).toBe("pasted");
        e.jobs.step();
        const flow = e.session.flow;
        const press = new PressPasteAim(
          e.repo,
          new PasteAt(
            e.repo,
            e.world,
            e.feedback,
            e.structures,
            new FakeBuildPlayers(),
          ),
          e.feedback,
        );
        if (!e.aim.target) throw new Error("Expected aim");
        expect(
          press.execute({
            playerId,
            dimensionId: nether,
            aim: e.aim.target,
            tick: tick + delta,
            sneaking: false,
          }),
        ).toBe("ignored");
        expect(e.session.flow).toBe(flow);
        expect(e.start).toHaveBeenCalledTimes(1);
        new UndoEdit(e.repo, e.feedback, e.jobs, e.world, e.structures, {
          warn: () => {},
        }).execute({ playerId });
        expect(e.session.flow).toEqual({ kind: "pasteAim", turn: 0 });
        expect(e.session.clipboard).toBe(e.clipboard);
        e.jobs.step();
        expect(e.world.stateAt(nether, e.target.anchor)).toBe(AIR);
        expect(e.session.hasHistory).toBe(false);
        expect(e.execute()).toBe("pasted");
        e.jobs.step();
        expect(e.start).toHaveBeenCalledTimes(3);
        expect(e.session.takeUndo()).toMatchObject({
          kind: "snapshot",
          snapshot: { dimensionId: nether },
        });
        expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      },
    ),
  );
});

it("returns the same result and leaves the same state regardless of sneaking", () => {
  fc.assert(
    fc.property(cell, face, tick, fc.boolean(), (block, face, tick, onAir) => {
      const press = (sneaking: boolean) => {
        const e = setup(block, face, tick);
        if (onAir && e.aim.target) e.aim.target = { ray: e.aim.target.ray };
        const result = e.execute(sneaking);
        e.jobs.step();
        return {
          result,
          flow: e.session.flow,
          clipboard: e.session.clipboard === e.clipboard,
          editing: e.session.isEditing,
          places: e.start.mock.calls,
          messages: e.feedback.messages,
          writes: e.world.writes,
        };
      };
      expect(press(true)).toEqual(press(false));
    }),
  );
});
