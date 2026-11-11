import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EndPasting } from "../../../src/application/build/endPasting";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { pasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import {
  beginPasteAim,
  recordPaste,
} from "../../../src/domain/build/flow/paste";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { undoRecord } from "../../support/undoRecord";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
function setup() {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const structures = new FakeStructureStore(world);
  const at = { x: 0, y: 0, z: 0 };
  holdClipboard(
    session,
    structureClipboard(boxOf(at, at), () => stone, structures),
  );
  session.setFlow(beginPasteAim());
  const paste = new PasteAt(
    repo,
    world,
    feedback,
    structures,
    new FakeBuildPlayers(),
  );
  const target = (block: { x: number; y: number; z: number }) => {
    if (!session.clipboard) throw new Error("Expected clipboard");
    return pasteTarget(session.clipboard, block, "up");
  };
  return { repo, session, world, feedback, paste, target, structures };
}

it("keeps aiming through successive synchronous pastes with the newest snapshots up to the shared cap", () => {
  fc.assert(
    fc.property(cell, fc.integer({ min: 1, max: 30 }), (origin, count) => {
      const e = setup();
      const start = vi.spyOn(e.structures, "place");
      for (let i = 0; i < count; i++) {
        const block = { ...origin, x: origin.x + i };
        e.paste.execute({
          playerId,
          dimensionId: overworld,
          target: e.target(block),
          tick: i * BUILD_SPEC.pasteRepeatTicks,
        });
        expect(e.session.flow).toEqual(
          recordPaste(
            beginPasteAim(),
            { ...block, y: block.y + 1 },
            i * BUILD_SPEC.pasteRepeatTicks,
          ),
        );
        expect(e.session.isEditing).toBe(false);
      }
      expect(start).toHaveBeenCalledTimes(count);
      expect(e.world.writes).toBe(count);
      expect(e.feedback.messages).toEqual(
        Array.from({ length: count }, () => ({
          message: "editDone",
          count: 1,
        })),
      );
      const last = { ...origin, x: origin.x + count - 1, y: origin.y + 1 };
      expect(e.session.takeUndo()).toMatchObject({
        kind: "snapshot",
        snapshot: { dimensionId: overworld, box: boxOf(last, last) },
      });
      expect(
        e.structures.calls.filter((c) => c.kind === "discard"),
      ).toHaveLength(Math.max(0, count - BUILD_SPEC.undoDepth));
      for (
        let i = count - 2;
        i >= Math.max(0, count - BUILD_SPEC.undoDepth);
        i--
      ) {
        const cell = { ...origin, x: origin.x + i, y: origin.y + 1 };
        expect(e.session.takeUndo()).toMatchObject({
          kind: "snapshot",
          snapshot: { box: boxOf(cell, cell) },
        });
      }
      expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
    }),
  );
});

it("silently ignores repeats, refuses busy and blocked taps, and records only successful placements", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 0, max: BUILD_SPEC.pasteRepeatTicks - 1 }),
      (block, delta) => {
        const e = setup();
        const start = vi.spyOn(e.structures, "place");
        const cmd = {
          playerId,
          dimensionId: overworld,
          target: e.target(block),
          tick: 100,
        };
        e.paste.execute(cmd);
        const flow = e.session.flow;
        e.feedback.messages.length = 0;
        const mayEdit = vi.spyOn(e.world, "mayEdit");
        e.paste.execute({ ...cmd, tick: cmd.tick + delta });
        expect(e.feedback.messages).toEqual([]);
        expect(mayEdit).not.toHaveBeenCalled();
        const other = { ...block, x: block.x + 1 };
        e.session.beginEdit();
        e.paste.execute({ ...cmd, target: e.target(other) });
        expect(e.feedback.messages.at(-1)?.message).toBe("busy");
        expect(e.session.flow).toBe(flow);
        e.session.finishEdit({ dimensionId: overworld, changes: [] }, "undo");
        const anchor = { ...other, y: other.y + 1 };
        e.world.protectedCells.add(cellKey(anchor));
        e.paste.execute({ ...cmd, target: e.target(other), tick: 200 });
        expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
        expect(e.session.flow).toBe(flow);
        expect(e.session.isEditing).toBe(false);
        expect(start).toHaveBeenCalledTimes(1);
        e.world.protectedCells.clear();
        e.paste.execute({ ...cmd, target: e.target(other), tick: 200 });
        expect(start).toHaveBeenCalledTimes(2);
        expect(e.session.flow).toMatchObject({
          kind: "pasteAim",
          turn: 0,
          lastPaste: { anchor, tick: 200 },
        });
      },
    ),
  );
});

it("allows the same anchor again once the repeat window ends", () => {
  const e = setup();
  const cmd = {
    playerId,
    dimensionId: overworld,
    target: e.target({ x: 0, y: 0, z: 0 }),
    tick: 0,
  };
  const start = vi.spyOn(e.structures, "place");
  e.paste.execute(cmd);
  e.paste.execute({ ...cmd, tick: BUILD_SPEC.pasteRepeatTicks });
  expect(start).toHaveBeenCalledTimes(2);
  expect(e.session.flow).toMatchObject({
    kind: "pasteAim",
    turn: 0,
    lastPaste: { tick: BUILD_SPEC.pasteRepeatTicks },
  });
});

it("leaves any flow after the exact grace delay and does not re-trigger", () => {
  fc.assert(
    fc.property(cell, fc.nat({ max: 30 }), (at, extraTicks) => {
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
      const height = chooseHeighted(endpoint, "gable");
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        height,
        beginPasteAim(),
      ]) {
        const e = setup();
        const leave = new LeaveBuild(e.repo, e.structures);
        const execute = vi.spyOn(leave, "execute");
        const modes = new UpdateBuildModes(e.repo, leave);
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          modes.execute([{ playerId, holding: true }]);
        e.session.confirmBox(overworld, boxOf(at, at));
        e.session.setFlow(flow);
        const clipboard = e.session.clipboard;
        const box = e.session.confirmedBox;
        // A one-tick item flicker must keep the copy (ADR 0203, Decision 5).
        modes.execute([{ playerId, holding: false }]);
        modes.execute([{ playerId, holding: true }]);
        expect(e.session.clipboard).toBe(clipboard);
        expect(e.session.confirmedBox).toBe(box);
        expect(e.session.flow).toBe(flow);
        for (let i = 0; i < BUILD_SPEC.modeLeaveTicks - 1; i++)
          modes.execute([{ playerId, holding: false }]);
        expect(e.session.flow).toBe(flow);
        expect(e.session.clipboard).toBe(clipboard);
        expect(e.session.confirmedBox).toBe(box);
        expect(execute).not.toHaveBeenCalled();
        modes.execute([{ playerId, holding: false }]);
        expect(e.session.flow).toEqual({ kind: "idle" });
        expect(e.session.clipboard).toBeUndefined();
        expect(e.session.confirmedBox).toBeUndefined();
        expect(e.session.mode).toEqual({ active: false, streak: 0 });
        const idle = e.session.flow;
        for (let i = 0; i < extraTicks + BUILD_SPEC.modeLeaveTicks; i++)
          modes.execute([{ playerId, holding: false }]);
        expect(execute).toHaveBeenCalledExactlyOnceWith(playerId);
        expect(e.session.flow).toBe(idle);
        expect(e.session.mode).toEqual({ active: false, streak: 0 });
      }
    }),
  );
});

it("LeaveBuild twice has the same effect as once in every flow", () => {
  fc.assert(
    fc.property(cell, (at) => {
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "copy"),
        beginPasteAim(),
      ]) {
        const e = setup();
        e.session.confirmBox(overworld, boxOf(at, at));
        e.session.setFlow(flow);
        const leave = new LeaveBuild(e.repo, e.structures);
        const end = vi.spyOn(e.session, "endPasting");
        leave.execute(playerId);
        const idle = e.session.flow;
        leave.execute(playerId);
        expect(e.session.flow).toBe(idle);
        expect(e.session.clipboard).toBeUndefined();
        expect(e.session.confirmedBox).toBeUndefined();
        expect(end).toHaveBeenCalledTimes(1);
      }
    }),
  );
});

it("EndPasting without a session does not create one", () => {
  fc.assert(
    fc.property(fc.string(), (id) => {
      const repo = new FakeSessions();
      const create = vi.spyOn(repo, "getOrCreate");
      const remove = vi.spyOn(repo, "remove");
      new EndPasting(repo, new FakeStructureStore()).execute(asPlayerId(id));
      expect(repo.get(asPlayerId(id))).toBeUndefined();
      expect(create).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    }),
  );
});

it("EndPasting preserves the completed snapshot and older cell history", () => {
  fc.assert(
    fc.property(cell, (block) => {
      const e = setup();
      const older = {
        dimensionId: overworld,
        changes: [{ cell: block, before: stone, after: AIR }],
      };
      e.session.finishEdit(older, "undoable");
      const target = e.target(block);
      e.paste.execute({ playerId, dimensionId: overworld, target, tick: 0 });
      expect(e.session.isEditing).toBe(false);
      new EndPasting(e.repo, e.structures).execute(playerId);
      expect(e.session.flow.kind).toBe("idle");
      expect(e.session.clipboard).toBeUndefined();
      expect(e.session.isEditing).toBe(false);
      expect(e.world.writes).toBe(1);
      expect(e.session.takeUndo()).toMatchObject({
        kind: "snapshot",
        snapshot: { dimensionId: overworld, box: target.box },
      });
      expect(undoRecord(e.session.takeUndo())).toBe(older);
      expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      const start = vi.spyOn(e.structures, "place");
      e.paste.execute({
        playerId,
        dimensionId: overworld,
        target,
        tick: BUILD_SPEC.pasteRepeatTicks,
      });
      expect(start).not.toHaveBeenCalled();
      expect(e.world.writes).toBe(1);
    }),
  );
});
