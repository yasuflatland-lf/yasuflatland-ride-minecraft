import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { DescribeBuild } from "../../../src/application/build/describeBuild";
import { EditJobs } from "../../../src/application/build/editJobs";
import { EndPasting } from "../../../src/application/build/endPasting";
import { NewCopy } from "../../../src/application/build/newCopy";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { RotatePasteAim } from "../../../src/application/build/rotatePasteAim";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import { pasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import type { QuarterTurn } from "../../../src/domain/build/rotation/quarterTurn";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("rotated");
const stone = blockStateOf("minecraft:stone");
const dirt = blockStateOf("minecraft:dirt");
const origin = fc.record({
  x: fc.integer({ min: -50, max: 50 }),
  y: fc.integer({ min: 0, max: 50 }),
  z: fc.integer({ min: -50, max: 50 }),
});
const turn = fc.constantFrom<QuarterTurn>(0, 1, 2, 3);

function setup(block: { x: number; y: number; z: number }, turn: QuarterTurn) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const store = new FakeStructureStore(world);
  const feedback = new FakeFeedback();
  const players = new FakeBuildPlayers();
  const source = boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 3 });
  const clipboard = structureClipboard(source, () => stone, store);
  session.completeCopy(overworld, source, clipboard);
  const rotate = new RotatePasteAim(repo);
  for (let i = 0; i < turn; i++)
    expect(rotate.execute({ playerId })).toBe("rotated");
  store.calls.length = 0;
  const target = pasteTarget(clipboard, block, "up", turn);
  const paste = new PasteAt(repo, world, feedback, store, players);
  const press = new PressPasteAim(repo, paste, feedback);
  const cmd = {
    playerId,
    dimensionId: overworld,
    aim: {
      block: { cell: block, face: "up" as const },
      ray: { origin: block, direction: { x: 0, y: -1, z: 0 } },
    },
    tick: 100,
  };
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    { warn: () => {} },
    players,
    store,
  );
  const undo = new UndoEdit(repo, feedback, jobs, world, store, {
    warn: () => {},
  });
  return {
    repo,
    session,
    world,
    store,
    clipboard,
    source,
    target,
    press,
    cmd,
    undo,
  };
}

it("uses the current turn for successive pastes and restores the entire rotated box on Undo", () => {
  fc.assert(
    fc.property(origin, turn, (block, turn) => {
      const e = setup(block, turn);
      for (const cell of cellsOf(e.target.box)) e.world.put(cell, dirt);
      expect(new DescribeBuild(e.repo).execute(playerId).pasteTurn).toBe(turn);
      expect(e.press.execute(e.cmd)).toBe("pasted");
      expect(e.store.calls[0]).toMatchObject({
        kind: "capture",
        box: e.target.box,
      });
      expect(e.store.calls[1]).toEqual({
        kind: "clearEntities",
        dimensionId: overworld,
        box: e.target.box,
      });
      expect(e.store.calls[2]).toEqual({
        kind: "place",
        handle: e.clipboard.contents.handle,
        dimensionId: overworld,
        anchor: e.target.anchor,
        turn,
      });
      for (const cell of cellsOf(e.target.box))
        expect(e.world.stateAt(overworld, cell)).toEqual(stone);
      const entry = e.session.takeUndo();
      if (typeof entry === "string" || entry.kind !== "snapshot")
        throw new Error("Expected snapshot");
      expect(entry.snapshot.box).toEqual(e.target.box);
      e.session.putBackUndo(entry);
      e.undo.execute({ playerId });
      expect(e.store.calls.slice(-3)).toEqual([
        { kind: "clearEntities", dimensionId: overworld, box: e.target.box },
        {
          kind: "place",
          dimensionId: overworld,
          anchor: e.target.box.min,
          turn: 0,
          handle: entry.snapshot.handle,
        },
        { kind: "discard", handle: entry.snapshot.handle },
      ]);
      for (const cell of cellsOf(e.target.box))
        expect(e.world.stateAt(overworld, cell)).toEqual(dirt);
      expect(e.session.pasteTurn).toBe(turn);
      expect(e.press.execute(e.cmd)).toBe("pasted");
      expect(
        e.press.execute({
          ...e.cmd,
          tick: e.cmd.tick + BUILD_SPEC.pasteRepeatTicks,
        }),
      ).toBe("pasted");
      expect(e.session.pasteTurn).toBe(turn);
      expect(
        e.store.calls.flatMap((c) =>
          c.kind === "place" && c.handle === e.clipboard.contents.handle
            ? [c.turn]
            : [],
        ),
      ).toEqual([turn, turn, turn]);
    }),
  );
});

it("refuses a blocked cell inside only the rotated footprint without changing flow or history", () => {
  fc.assert(
    fc.property(origin, fc.constantFrom<QuarterTurn>(1, 3), (block, turn) => {
      const e = setup(block, turn);
      const original = pasteTarget(e.clipboard, block, "up");
      const blocked = { ...e.target.anchor, x: original.box.max.x + 1 };
      expect(blocked.x).toBeLessThanOrEqual(e.target.box.max.x);
      e.world.protectedCells.add(cellKey(blocked));
      const previous = e.store.capture(overworld, original.box, playerId);
      if (previous === "tooLarge" || previous === "unreadable")
        throw new Error(previous);
      const snapshot = {
        dimensionId: overworld,
        box: original.box,
        handle: previous,
      };
      e.session.recordSnapshot(snapshot);
      e.store.calls.length = 0;
      const flow = e.session.flow;
      expect(e.press.execute(e.cmd)).toBe("refused");
      expect(e.session.flow).toBe(flow);
      expect(e.store.calls).toEqual([]);
      expect(e.session.takeUndo()).toEqual({ kind: "snapshot", snapshot });
    }),
  );
});

it("resets the turn on New copy, a completed copy and End pasting", () => {
  fc.assert(
    fc.property(
      origin,
      fc.constantFrom<QuarterTurn>(1, 2, 3),
      (block, turn) => {
        for (const action of [
          "newCopy",
          "completeCopy",
          "endPasting",
        ] as const) {
          const e = setup(block, turn);
          if (action === "newCopy") new NewCopy(e.repo).execute(playerId);
          if (action === "completeCopy")
            e.session.completeCopy(overworld, e.source, e.clipboard);
          if (action === "endPasting")
            new EndPasting(e.repo, e.store).execute(playerId);
          expect(e.session.pasteTurn).toBe(0);
          expect(new DescribeBuild(e.repo).execute(playerId).pasteTurn).toBe(0);
          if (action !== "completeCopy")
            expect(e.session.rotatePaste()).toBe(false);
        }
      },
    ),
  );
});

it("restores a failed rotated placement with an unturned snapshot", () => {
  fc.assert(
    fc.property(
      origin,
      fc.constantFrom<QuarterTurn>(1, 2, 3),
      (block, turn) => {
        const e = setup(block, turn);
        for (const cell of cellsOf(e.target.box)) e.world.put(cell, dirt);
        const flow = e.session.flow;
        const place = e.store.place.bind(e.store);
        vi.spyOn(e.store, "place").mockImplementation(
          (handle, dimensionId, anchor, turn) => {
            const result = place(handle, dimensionId, anchor, turn);
            return handle === e.clipboard.contents.handle ? false : result;
          },
        );
        expect(e.press.execute(e.cmd)).toBe("refused");
        expect(e.session.flow).toBe(flow);
        expect(e.session.hasHistory).toBe(false);
        expect(e.store.calls[4]).toMatchObject({
          kind: "place",
          dimensionId: overworld,
          anchor: e.target.box.min,
          turn: 0,
        });
        for (const cell of cellsOf(e.target.box))
          expect(e.world.stateAt(overworld, cell)).toEqual(dirt);
      },
    ),
  );
});
