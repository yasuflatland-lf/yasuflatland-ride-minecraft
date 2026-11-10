import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { EndPasting } from "../../../src/application/build/endPasting";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { ToggleSkipAir } from "../../../src/application/build/toggleSkipAir";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  clipboardOf,
  pasteTarget,
} from "../../../src/domain/build/clipboard/clipboard";
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
import { holdClipboard } from "../../support/buildClipboard";
import { undoRecord } from "../../support/undoRecord";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
function setup() {
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
  const at = { x: 0, y: 0, z: 0 };
  holdClipboard(
    session,
    clipboardOf(boxOf(at, at), () => stone),
  );
  session.setFlow(beginPasteAim(false));
  const paste = new PasteAt(repo, world, feedback, jobs);
  const target = (block: { x: number; y: number; z: number }) => {
    if (!session.clipboard) throw new Error("Expected clipboard");
    return pasteTarget(session.clipboard, block, "up");
  };
  return { repo, session, world, feedback, jobs, paste, target };
}

it("keeps aiming through successive pastes with one job and bounded undo record per paste", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 1, max: BUILD_SPEC.undoDepth * 3 }),
      (origin, count) => {
        const e = setup();
        const start = vi.spyOn(e.jobs, "start");
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
              beginPasteAim(false),
              { ...block, y: block.y + 1 },
              i * BUILD_SPEC.pasteRepeatTicks,
            ),
          );
          expect(e.session.isEditing).toBe(true);
          e.jobs.step();
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
        for (
          let i = count - 1;
          i >= Math.max(0, count - BUILD_SPEC.undoDepth);
          i--
        )
          expect(undoRecord(e.session.takeUndo())).toEqual({
            dimensionId: overworld,
            changes: [
              {
                cell: { ...origin, x: origin.x + i, y: origin.y + 1 },
                before: AIR,
                after: stone,
              },
            ],
          });
        expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      },
    ),
  );
});

it("silently ignores repeats, refuses busy and blocked taps, and records only successful starts", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 0, max: BUILD_SPEC.pasteRepeatTicks - 1 }),
      (block, delta) => {
        const e = setup();
        const start = vi.spyOn(e.jobs, "start");
        const cmd = {
          playerId,
          dimensionId: overworld,
          target: e.target(block),
          tick: 100,
        };
        e.paste.execute(cmd);
        const flow = e.session.flow;
        const mayEdit = vi.spyOn(e.world, "mayEdit");
        e.paste.execute({ ...cmd, tick: cmd.tick + delta });
        expect(e.feedback.messages).toEqual([]);
        expect(mayEdit).not.toHaveBeenCalled();
        const other = { ...block, x: block.x + 1 };
        e.paste.execute({ ...cmd, target: e.target(other) });
        expect(e.feedback.messages.at(-1)?.message).toBe("busy");
        expect(e.session.flow).toBe(flow);
        e.jobs.step();
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
  const start = vi.spyOn(e.jobs, "start");
  e.paste.execute(cmd);
  e.jobs.step();
  e.paste.execute({ ...cmd, tick: BUILD_SPEC.pasteRepeatTicks });
  expect(start).toHaveBeenCalledTimes(2);
  expect(e.session.flow).toMatchObject({
    kind: "pasteAim",
    lastPaste: { tick: BUILD_SPEC.pasteRepeatTicks },
  });
});

it("leaves any flow after the exact grace delay and does not re-trigger", () => {
  fc.assert(
    fc.property(
      cell,
      fc.boolean(),
      fc.nat({ max: 30 }),
      (at, skipAir, extraTicks) => {
        const first = tapBlock({ kind: "idle" }, overworld, at, stone);
        const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
        const height = chooseHeighted(endpoint, "gable");
        for (const flow of [
          { kind: "idle" } as const,
          first,
          endpoint,
          height,
          beginPasteAim(skipAir),
        ]) {
          const e = setup();
          const leave = new LeaveBuild(e.repo);
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
      },
    ),
  );
});

it("LeaveBuild twice has the same effect as once in every flow", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (at, skipAir) => {
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "copy"),
        beginPasteAim(skipAir),
      ]) {
        const e = setup();
        e.session.confirmBox(overworld, boxOf(at, at));
        e.session.setFlow(flow);
        const leave = new LeaveBuild(e.repo);
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

it("ToggleSkipAir flips only a paste aim and ignores unknown players", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (at, skipAir) => {
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "gable"),
        beginPasteAim(skipAir),
      ]) {
        const e = setup();
        const toggle = new ToggleSkipAir(e.repo);
        toggle.execute({ playerId: asPlayerId("absent") });
        expect(e.repo.get(asPlayerId("absent"))).toBeUndefined();
        e.session.setFlow(flow);
        toggle.execute({ playerId });
        if (flow.kind === "pasteAim")
          expect(e.session.flow).toEqual({ ...flow, skipAir: !skipAir });
        else expect(e.session.flow).toBe(flow);
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
      new EndPasting(repo).execute(asPlayerId(id));
      expect(repo.get(asPlayerId(id))).toBeUndefined();
      expect(create).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    }),
  );
});

it("EndPasting lets a running paste finish with its undo record and keeps older history", () => {
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
      expect(e.session.isEditing).toBe(true);
      new EndPasting(e.repo).execute(playerId);
      expect(e.session.flow.kind).toBe("idle");
      expect(e.session.clipboard).toBeUndefined();
      expect(e.session.isEditing).toBe(true);
      expect(undoRecord(e.session.takeUndo())).toBe("busy");
      e.jobs.step();
      expect(e.session.isEditing).toBe(false);
      expect(e.world.writes).toBe(1);
      expect(undoRecord(e.session.takeUndo())).toEqual({
        dimensionId: overworld,
        changes: [{ cell: target.anchor, before: AIR, after: stone }],
      });
      expect(undoRecord(e.session.takeUndo())).toBe(older);
      expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      const start = vi.spyOn(e.jobs, "start");
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

it("uses the toggled setting for subsequent pastes while a running job keeps its plan", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (block, skipAir) => {
      const e = setup();
      const source = { x: 0, y: 0, z: 0 };
      holdClipboard(
        e.session,
        clipboardOf(boxOf(source, { ...source, x: 1 }), (c) =>
          c.x === 0 ? AIR : stone,
        ),
      );
      e.session.setFlow(beginPasteAim(skipAir));
      const toggle = new ToggleSkipAir(e.repo);
      for (let i = 0; i < 2; i++) {
        const target = e.target({ ...block, x: block.x + i * 3 });
        e.world.put(target.anchor, stone);
        expect(
          e.paste.execute({
            playerId,
            dimensionId: overworld,
            target,
            tick: i * BUILD_SPEC.pasteRepeatTicks,
          }),
        ).toBe("pasted");
        expect(e.session.isEditing).toBe(true);
        const before = e.session.flow;
        toggle.execute({ playerId });
        expect(e.session.flow).toMatchObject({
          lastPaste: before.kind === "pasteAim" ? before.lastPaste : undefined,
        });
        e.jobs.step();
        const plannedSkipAir = i === 0 ? skipAir : !skipAir;
        expect(e.world.stateAt(overworld, target.anchor)).toEqual(
          plannedSkipAir ? stone : AIR,
        );
        expect(
          e.world.stateAt(overworld, {
            ...target.anchor,
            x: target.anchor.x + 1,
          }),
        ).toEqual(stone);
      }
    }),
  );
});
