import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { StopPaste } from "../../../src/application/build/stopPaste";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  startPaste,
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
  cellKey,
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
  const jobs = new EditJobs(repo, world, feedback);
  const at = { x: 0, y: 0, z: 0 };
  session.setClipboard(clipboardOf(boxOf(at, at), () => stone));
  session.setFlow(startPaste(session.flow, false));
  const paste = new PasteAt(repo, world, feedback, jobs);
  return { repo, session, world, feedback, jobs, paste };
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
            block,
            face: "up",
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
          expect(e.session.takeUndo()).toEqual({
            dimensionId: overworld,
            changes: [
              {
                cell: { ...origin, x: origin.x + i, y: origin.y + 1 },
                before: AIR,
                after: stone,
              },
            ],
          });
        expect(e.session.takeUndo()).toBe("nothingToUndo");
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
          block,
          face: "up" as const,
          tick: 100,
        };
        e.paste.execute(cmd);
        const flow = e.session.flow;
        const mayEdit = vi.spyOn(e.world, "mayEdit");
        e.paste.execute({ ...cmd, tick: cmd.tick + delta });
        expect(e.feedback.messages).toEqual([]);
        expect(mayEdit).not.toHaveBeenCalled();
        const other = { ...block, x: block.x + 1 };
        e.paste.execute({ ...cmd, block: other });
        expect(e.feedback.messages.at(-1)?.message).toBe("busy");
        expect(e.session.flow).toBe(flow);
        e.jobs.step();
        const anchor = { ...other, y: other.y + 1 };
        e.world.protectedCells.add(cellKey(anchor));
        e.paste.execute({ ...cmd, block: other, tick: 200 });
        expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
        expect(e.session.flow).toBe(flow);
        expect(e.session.isEditing).toBe(false);
        expect(start).toHaveBeenCalledTimes(1);
        e.world.protectedCells.clear();
        e.paste.execute({ ...cmd, block: other, tick: 200 });
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
    block: { x: 0, y: 0, z: 0 },
    face: "up" as const,
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

it("stops only paste aiming and cancels all in-progress flows on leaving build mode", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (at, skipAir) => {
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 });
      const height = chooseHeighted(endpoint, "gable");
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        height,
        startPaste({ kind: "idle" }, skipAir),
      ]) {
        const e = setup();
        const stop = new StopPaste(e.repo);
        stop.execute({ playerId: asPlayerId("absent") });
        expect(e.repo.get(asPlayerId("absent"))).toBeUndefined();
        e.session.setFlow(flow);
        stop.execute({ playerId });
        if (flow.kind === "pasteAim")
          expect(e.session.flow).toEqual({ kind: "idle" });
        else expect(e.session.flow).toBe(flow);
        const modes = new UpdateBuildModes(e.repo, new CancelFlow(e.repo));
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          modes.execute([{ playerId, holding: true }]);
        e.session.setFlow(flow);
        for (let i = 0; i < BUILD_SPEC.modeLeaveTicks - 1; i++)
          modes.execute([{ playerId, holding: false }]);
        expect(e.session.flow).toBe(flow);
        modes.execute([{ playerId, holding: false }]);
        expect(e.session.flow).toEqual({ kind: "idle" });
      }
    }),
  );
});
