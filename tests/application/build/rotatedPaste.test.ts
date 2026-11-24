import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { EndPasting } from "../../../src/application/build/endPasting";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import { pasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import {
  facingVector,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import type { QuarterTurn } from "../../../src/domain/build/rotation/quarterTurn";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { DescribeBuild } from "../../../src/infrastructure/build/testHooks/describeBuild";
import { structureClipboard } from "../../support/buildClipboard";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("rotated");
const stone = blockStateOf("minecraft:stone");
const marker = blockStateOf("minecraft:gold_block");
const dirt = blockStateOf("minecraft:dirt");
const origin = fc.record({
  x: fc.integer({ min: -50, max: 50 }),
  y: fc.integer({ min: 0, max: 50 }),
  z: fc.integer({ min: -50, max: 50 }),
});
const turn = fc.constantFrom<QuarterTurn>(0, 1, 2, 3);

function setup(block: { x: number; y: number; z: number }, turn: QuarterTurn) {
  const world = new FakeWorld();
  const store = new FakeStructureStore(world);
  const repo = new FakeSessions(store);
  const session = repo.getOrCreate(playerId);
  const feedback = new FakeFeedback();
  const players = new FakeBuildPlayers();
  const source = boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 3 });
  const clipboard = structureClipboard(
    source,
    (cell) => (cell.x === 0 && cell.y === 0 && cell.z === 0 ? marker : stone),
    store,
  );
  session.completeCopy(selectionOf(overworld, source, stone), clipboard);
  const facing = (["east", "south", "west", "north"] as const)[turn];
  session.followPasteFacing(facing);
  store.calls.length = 0;
  const target = pasteTarget(
    clipboard,
    block,
    "up",
    turnBetween(clipboard.facing, facing),
    facing,
  );
  const paste = new PasteAt(repo, world, feedback, store, players);
  const press = new PressPasteAim(
    repo,
    paste,
    feedback,
    new ResolvePasteTarget(repo, new FakeGroundProbe()),
  );
  const cmd = {
    playerId,
    dimensionId: overworld,
    aim: {
      block: { cell: block, face: "up" as const },
      input: "pointer" as const,
      ray: { origin: block, direction: facingVector(facing) },
    },
    tick: 100,
    sneaking: true,
  };
  const jobs = new EditJobs(repo, world, feedback, { warn: () => {} }, players);
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

it("uses the live turn for a paste and restores the entire rotated box on Undo", () => {
  fc.assert(
    fc.property(origin, turn, (block, turn) => {
      const e = setup(block, turn);
      for (const cell of cellsOf(e.target.box)) e.world.put(cell, dirt);
      expect(new DescribeBuild(e.repo).execute(playerId).pasteTurn).toBe(turn);
      expect(e.press.execute(e.cmd)).toBe("pasted");
      expect(e.store.calls).toContainEqual(
        expect.objectContaining({
          kind: "capture",
          box: e.target.box,
          mode: "exact",
        }),
      );
      expect(e.store.calls).toContainEqual({
        kind: "clearEntities",
        dimensionId: overworld,
        box: e.target.box,
      });
      expect(e.store.calls).toContainEqual({
        kind: "place",
        handle: e.clipboard.contents.handle,
        dimensionId: overworld,
        anchor: e.target.anchor,
        turn,
      });
      // The source minimum visits these four corners of the 2-by-4 footprint (ADR 0245).
      const [dx, dz] = (
        [
          [0, 0],
          [3, 0],
          [1, 3],
          [0, 1],
        ] as const
      )[turn];
      const markerCell = {
        x: e.target.anchor.x + dx,
        y: e.target.anchor.y,
        z: e.target.anchor.z + dz,
      };
      for (const cell of cellsOf(e.target.box)) {
        expect(e.world.stateAt(overworld, cell)).toEqual(
          cellKey(cell) === cellKey(markerCell) ? marker : stone,
        );
      }
      const entry = e.session.takeUndo();
      if (typeof entry === "string" || entry.kind !== "snapshot")
        throw new Error("Expected snapshot");
      expect(entry.snapshot.box).toEqual(e.target.box);
      e.session.putBackUndo(entry);
      e.undo.execute({ playerId });
      expect(e.store.live.has(entry.snapshot.handle)).toBe(false);
      for (const cell of cellsOf(e.target.box))
        expect(e.world.stateAt(overworld, cell)).toEqual(dirt);
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
      expect(e.session.pasteTurn).toBe(0);
      expect(e.press.execute(e.cmd)).toBe("pasted");
      expect(
        e.press.execute({
          ...e.cmd,
          tick: e.cmd.tick + BUILD_SPEC.pasteRepeatTicks,
        }),
      ).toBe("ignored");
      expect(e.session.pasteTurn).toBe(0);
      expect(
        e.store.calls.flatMap((c) =>
          c.kind === "place" && c.handle === e.clipboard.contents.handle
            ? [c.turn]
            : [],
        ),
      ).toEqual([turn, turn]);
    }),
  );
});

it("refuses a blocked cell inside only the rotated footprint without changing flow or history", () => {
  fc.assert(
    fc.property(origin, fc.constantFrom<QuarterTurn>(1, 3), (block, turn) => {
      const e = setup(block, turn);
      const original = pasteTarget(
        e.clipboard,
        block,
        "up",
        turnBetween(e.clipboard.facing, "east"),
        "east",
      );
      const blocked = [...cellsOf(e.target.box)].find(
        (cell) =>
          cell.x < original.box.min.x ||
          cell.x > original.box.max.x ||
          cell.z < original.box.min.z ||
          cell.z > original.box.max.z,
      );
      if (!blocked) throw new Error("Missing rotated-only cell");
      e.world.protectedCells.add(cellKey(blocked));
      const previous = e.store.capture(
        overworld,
        original.box,
        playerId,
        "exact",
      );
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
      expect(e.session.flow).toEqual(flow);
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
          if (action === "newCopy") e.repo.get(playerId)?.startNewCopy();
          if (action === "completeCopy")
            e.session.completeCopy(
              selectionOf(overworld, e.source, stone),
              e.clipboard,
            );
          if (action === "endPasting") new EndPasting(e.repo).execute(playerId);
          expect(e.session.pasteTurn).toBe(0);
          expect(new DescribeBuild(e.repo).execute(playerId).pasteTurn).toBe(0);
          if (action !== "completeCopy") {
            const flow = e.session.flow;
            e.session.followPasteFacing("south");
            expect(e.session.flow).toBe(flow);
          }
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
        expect(e.session.flow).toEqual(flow);
        expect(e.session.hasHistory).toBe(false);
        expect(e.store.calls).toContainEqual(
          expect.objectContaining({
            kind: "place",
            dimensionId: overworld,
            anchor: e.target.box.min,
            turn: 0,
          }),
        );
        for (const cell of cellsOf(e.target.box))
          expect(e.world.stateAt(overworld, cell)).toEqual(dirt);
      },
    ),
  );
});
