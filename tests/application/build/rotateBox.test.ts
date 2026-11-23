import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PressUndo } from "../../../src/application/build/pressUndo";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateSelection } from "../../../src/application/build/rotateSelection";
import { StepBackSelection } from "../../../src/application/build/stepBackSelection";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  boxOf,
  type CellBox,
  cellsOf,
  contains,
  sameBox,
  volume,
} from "../../../src/domain/build/box";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/heightFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { selectionBoxOf } from "../../../src/test-pack/scenarios/support/buildSelection";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
const stone = blockStateOf("minecraft:stone");
const origin = { x: 0, y: 64, z: 0 };
const wideBox = boxOf(origin, { x: 4, y: 65, z: 1 });
const coordinate = fc.integer({ min: -100, max: 100 });
const cellArb = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const sizeArb = fc.integer({ min: 1, max: 6 });
const boxArb = fc
  .tuple(cellArb, sizeArb, sizeArb, sizeArb)
  .map(([min, x, y, z]) =>
    boxOf(min, { x: min.x + x - 1, y: min.y + y - 1, z: min.z + z - 1 }),
  );

function setup(box: CellBox = wideBox) {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const players = new FakeBuildPlayers();
  const structures = new FakeStructureStore(world);
  const feedback = new FakeFeedback();
  const log = { warn: vi.fn() };
  const session = repo.getOrCreate(playerId);
  session.setFlow({
    kind: "selected",
    menuLevel: "root",
    selection: selectionOf(overworld, box, stone),
    from: box.min,
    to: box.max,
  });
  const rotate = new RotateBox(repo, world, players, structures, feedback, log);
  const jobs = new EditJobs(repo, world, feedback, log, players, structures);
  const undo = new UndoEdit(repo, feedback, jobs, world, structures, log);
  return {
    repo,
    world,
    players,
    structures,
    feedback,
    log,
    session,
    rotate,
    rotateSelection: new RotateSelection(repo, rotate, feedback),
    undo,
  };
}

it("rotates any selection with one union snapshot and never writes outside the union", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const e = setup(box);
      const plan = planRotationAboutCenter(box);
      const writes = vi.spyOn(e.world, "setState");
      const mayEdit = vi.spyOn(e.world, "mayEdit");
      e.world.put(box.min, stone);
      expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
        "rotated",
      );
      expect(new Set(mayEdit.mock.calls)).toEqual(
        new Set([...cellsOf(plan.union)].map((cell) => [overworld, cell])),
      );
      expect(
        e.world.stateAt(overworld, {
          x: plan.target.max.x,
          y: plan.target.min.y,
          z: plan.target.min.z,
        }),
      ).toEqual(stone);
      for (const [, cell] of writes.mock.calls)
        expect(contains(plan.union, cell)).toBe(true);
      const [snapshot] = e.structures.live;
      const placed = e.structures.calls.find((call) => call.kind === "place");
      expect(placed).toMatchObject({
        kind: "place",
        dimensionId: overworld,
        anchor: plan.target.min,
        turn: 1,
      });
      if (placed?.kind !== "place")
        throw new Error("Missing rotated placement");
      const firstClear = e.structures.calls.findIndex(
        (c) => c.kind === "clearEntities" || c.kind === "clearBlocks",
      );
      const captures = e.structures.calls.slice(0, firstClear);
      expect(captures).toHaveLength(2);
      for (const area of [box, plan.union]) {
        expect(captures).toContainEqual({
          kind: "capture",
          dimensionId: overworld,
          box: area,
          ownerId: playerId,
          mode: "exact",
        });
      }
      expect(e.structures.calls).toContainEqual({
        kind: "clearEntities",
        dimensionId: overworld,
        box,
      });
      expect(e.structures.live.size).toBe(1);
      expect(e.structures.live.has(placed.handle)).toBe(false);
      expect(e.session.takeUndo()).toEqual({
        kind: "snapshot",
        snapshot: {
          dimensionId: overworld,
          box: plan.union,
          handle: snapshot,
          selectionBefore: box,
          selectionBeforeTaps: { from: box.min, to: box.max },
        },
      });
      expect(e.session.takeUndo()).toBe("nothingToUndo");
      expect(selectionBoxOf(e.session.flow)).toEqual(plan.target);
      expect(e.session.flow).toMatchObject({
        kind: "selected",
        menuLevel: "root",
        selection: { dimensionId: overworld, material: stone },
      });
      expect(e.feedback.messages).toEqual([
        { message: "rotateDone", count: volume(box) },
      ]);
      expect(e.log.warn).not.toHaveBeenCalled();
    }),
  );
});

it("rotates the selected box once per press, restores the box and taps for each undone turn", () => {
  const e = setup();
  const cmd = { playerId, dimensionId: overworld };
  const { union, target } = planRotationAboutCenter(wideBox);
  e.world.put(wideBox.min, stone);
  const states = () =>
    [...cellsOf(union)].map((cell) => e.world.stateAt(overworld, cell));
  const original = states();
  for (const [i, box] of [target, wideBox].entries()) {
    expect(e.rotateSelection.execute(cmd)).toBe("rotated");
    expect(e.session.flow).toMatchObject({
      kind: "selected",
      selection: selectionOf(overworld, box, stone),
      from: box.min,
      to: box.max,
    });
    expect(e.structures.live.size).toBe(i + 1);
  }
  for (const box of [target, wideBox]) {
    e.undo.execute({ playerId });
    expect(e.session.flow).toMatchObject({
      kind: "selected",
      selection: selectionOf(overworld, box, stone),
      from: box.min,
      to: box.max,
    });
  }
  expect(states()).toEqual(original);
  expect(e.session.hasHistory).toBe(false);
});

it("keeps a refused selection and reports the rotation guard's reason", () => {
  const e = setup();
  const before = e.session.flow;
  e.world.protectedCells.add(cellKey(wideBox.min));
  expect(e.rotateSelection.execute({ playerId, dimensionId: overworld })).toBe(
    "refused",
  );
  expect(e.feedback.messages.at(-1)?.message).toBe("rotateBlocked");
  expect(e.session.flow).toBe(before);
  expect(e.session.hasHistory).toBe(false);
});

it("reports no selection outside selected flow or in a different dimension", () => {
  const e = setup();
  expect(e.rotateSelection.execute({ playerId, dimensionId: nether })).toBe(
    "noSelection",
  );
  e.session.setFlow({ kind: "idle" });
  expect(e.rotateSelection.execute({ playerId, dimensionId: overworld })).toBe(
    "noSelection",
  );
  expect(e.feedback.messages.map((m) => m.message)).toEqual([
    "noSelection",
    "noSelection",
  ]);
  expect(e.structures.calls).toEqual([]);
});

it("undo restores every original union cell, including overwritten neighbors", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const e = setup(box);
      const { union } = planRotationAboutCenter(box);
      const original = [...cellsOf(union)].map((cell, index) => ({
        cell,
        state: blockStateOf("minecraft:stone", { fixture: index }),
      }));
      for (const { cell, state } of original) e.world.put(cell, state);
      expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
        "rotated",
      );
      e.undo.execute({ playerId });
      for (const { cell, state } of original)
        expect(e.world.stateAt(overworld, cell)).toEqual(state);
      expect(e.structures.live.size).toBe(0);
      expect(e.session.hasHistory).toBe(false);
    }),
  );
});

it("refuses protection on any union cell outside the source without capturing or writing", () => {
  fc.assert(
    fc.property(fc.nat(), (index) => {
      const e = setup();
      const outside = [
        ...cellsOf(planRotationAboutCenter(wideBox).union),
      ].filter((cell) => !contains(wideBox, cell));
      const blocked = outside[index % outside.length];
      if (!blocked) throw new Error("Missing outside cell");
      e.world.protectedCells.add(cellKey(blocked));
      const before = structuredClone(e.session);
      expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
        "refused",
      );
      expect(e.structures.calls).toEqual([]);
      expect(e.structures.live.size).toBe(0);
      expect(e.world.writes).toBe(0);
      expect(e.session).toEqual(before);
      expect(e.feedback.messages.at(-1)?.message).toBe("rotateBlocked");
    }),
  );
});

it("refuses a laid cell anywhere in the selection before capturing or writing", () => {
  fc.assert(
    fc.property(fc.nat(), (index) => {
      const e = setup();
      const cells = [...cellsOf(wideBox)];
      const cell = cells[index % cells.length];
      if (!cell) throw new Error("Missing source cell");
      e.world.laidCells.add(cellKey(cell));
      const before = structuredClone(e.session);
      expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
        "refused",
      );
      expect(e.feedback.messages.at(-1)?.message).toBe("rotateBlocked");
      expect(e.structures.calls).toEqual([]);
      expect(e.world.writes).toBe(0);
      expect(e.session).toEqual(before);
    }),
  );
});

it.each(["tooLarge", "unreadable"] as const)(
  "discards new handles on either capture refusal: %s",
  (refusal) => {
    for (const second of [false, true]) {
      const e = setup();
      const before = structuredClone(e.session);
      const flow = e.session.flow;
      e.structures.captureRefusals = second ? [undefined, refusal] : [refusal];
      expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
        "refused",
      );
      expect(e.structures.calls.some((c) => c.kind === "clearEntities")).toBe(
        false,
      );
      expect(e.structures.live.size).toBe(0);
      expect(e.world.writes).toBe(0);
      expect(e.session).toEqual(before);
      expect(e.session.flow).toBe(flow);
      expect(e.session.hasHistory).toBe(false);
      expect(e.feedback.messages).toEqual([
        {
          message: refusal === "tooLarge" ? "rotateTooLarge" : "copyUnreadable",
          count:
            refusal === "tooLarge"
              ? volume(planRotationAboutCenter(wideBox).union)
              : undefined,
        },
      ]);
    }
  },
);

it("checks union size before busy and busy before protection", () => {
  const thin = boxOf(origin, { x: 63, y: 79, z: 0 });
  expect(volume(thin)).toBeLessThan(BUILD_SPEC.maxCopyVolume);
  for (const box of [thin, wideBox]) {
    const e = setup(box);
    e.session.beginEdit();
    const before = structuredClone(e.session);
    const mayEdit = vi.spyOn(e.world, "mayEdit");
    const oversized = box === thin;
    expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
      oversized ? "refused" : "busy",
    );
    expect(e.feedback.messages.at(-1)).toEqual({
      message: oversized ? "rotateTooLarge" : "busy",
      count: oversized ? volume(planRotationAboutCenter(box).union) : undefined,
    });
    expect(mayEdit).not.toHaveBeenCalled();
    expect(e.structures.calls).toEqual([]);
    expect(e.structures.live.size).toBe(0);
    expect(e.world.writes).toBe(0);
    expect(e.session).toEqual(before);
  }
});

it("ignores idle, incomplete and other-dimension selections", () => {
  const flows: BuildFlow[] = [
    { kind: "idle" },
    { kind: "point1", dimensionId: overworld, cell: origin, material: stone },
    {
      kind: "selected",
      menuLevel: "root",
      selection: selectionOf(nether, wideBox, stone),
      from: wideBox.min,
      to: wideBox.max,
    },
  ];
  for (const flow of flows) {
    const e = setup();
    e.session.setFlow(flow);
    const before = structuredClone(e.session);
    expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
      "ignored",
    );
    expect(e.structures.calls).toEqual([]);
    expect(e.feedback.messages).toEqual([]);
    expect(e.session).toEqual(before);
    expect(e.session.flow).toBe(flow);
  }
});

it("ignores an absent session without creating one", () => {
  const e = setup();
  e.repo.remove(playerId);
  expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
    "ignored",
  );
  expect(e.repo.get(playerId)).toBeUndefined();
  expect(e.structures.calls).toEqual([]);
  expect(e.feedback.messages).toEqual([]);
});

it.each(["clear", "place"] as const)(
  "attempts snapshot restoration after a failed %s and preserves earlier undo",
  (failure) => {
    const e = setup();
    const { union } = planRotationAboutCenter(wideBox);
    const previous = e.structures.capture(
      overworld,
      wideBox,
      playerId,
      "exact",
    );
    if (previous === "tooLarge" || previous === "unreadable")
      throw new Error("Missing snapshot");
    e.session.recordSnapshot({
      dimensionId: overworld,
      box: wideBox,
      handle: previous,
    });
    e.structures.calls.length = 0;
    const before = structuredClone(e.session);
    const flow = e.session.flow;
    const capture = vi.spyOn(e.structures, "capture");
    if (failure === "clear") e.structures.clearBlocksSucceeds = false;
    else e.structures.placeSucceeds = false;
    expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
      "refused",
    );
    const restore = e.structures.calls
      .filter((call) => call.kind === "place")
      .at(-1);
    expect(restore).toMatchObject({
      kind: "place",
      handle:
        capture.mock.results[
          capture.mock.calls.findIndex(([, area]) => sameBox(area, union))
        ]?.value,
      dimensionId: overworld,
      anchor: union.min,
      turn: 0,
    });
    if (restore?.kind !== "place") throw new Error("Missing restoration");
    expect(
      e.structures.calls.slice(e.structures.calls.indexOf(restore) + 1),
    ).toContainEqual({
      kind: "discard",
      handle: restore.handle,
    });
    expect(e.structures.calls).toContainEqual({
      kind: "clearEntities",
      dimensionId: overworld,
      box: union,
    });
    expect([...e.structures.live]).toEqual([previous]);
    expect(e.session).toEqual(before);
    expect(e.session.flow).toBe(flow);
    expect(e.feedback.messages).toEqual([
      { message: "rotateFailed", count: undefined },
    ]);
    expect(e.log.warn).toHaveBeenCalledOnce();
  },
);

it("retains an earlier snapshot and frees a player buried in the rotated target", () => {
  const e = setup();
  const plan = planRotationAboutCenter(wideBox);
  const previous = e.structures.capture(overworld, wideBox, playerId, "exact");
  if (previous === "tooLarge" || previous === "unreadable")
    throw new Error(previous);
  e.session.recordSnapshot({
    dimensionId: overworld,
    box: wideBox,
    handle: previous,
  });
  for (const cell of cellsOf(wideBox)) e.world.put(cell, stone);
  e.players.occupants.set(playerId, {
    dimensionId: overworld,
    feet: plan.target.min,
  });
  expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
    "rotated",
  );
  expect(e.structures.live.has(previous)).toBe(true);
  expect(e.structures.live.size).toBe(2);
  expect(e.players.moves).toEqual([
    { playerId, cell: { ...plan.target.min, y: wideBox.max.y + 1 } },
  ]);
  expect(e.session.takeUndo()).toMatchObject({
    kind: "snapshot",
    snapshot: { box: plan.union },
  });
  expect(e.session.takeUndo()).toMatchObject({
    kind: "snapshot",
    snapshot: { handle: previous },
  });
  expect(e.session.takeUndo()).toBe("nothingToUndo");
});

it.each([false, true])(
  "Build Undo reverses a fresh line rotation only when it succeeds (blocked: %s)",
  (blocked) => {
    const end = { ...origin, x: origin.x + 4 };
    const box = boxOf(origin, end);
    const e = setup(box);
    const point = tapBlock({ kind: "idle" }, overworld, origin, stone);
    const fresh = tapAir(point, end);
    e.session.setFlow(fresh);
    for (const cell of cellsOf(box)) e.world.put(cell, stone);
    const union = planRotationAboutCenter(box).union;
    const original = [...cellsOf(union)].map((cell) =>
      e.world.stateAt(overworld, cell),
    );
    if (blocked) e.world.protectedCells.add(cellKey(origin));
    expect(
      e.rotateSelection.execute({ playerId, dimensionId: overworld }),
    ).toBe(blocked ? "refused" : "rotated");
    const press = new PressUndo(
      new StepBackSelection(e.repo, e.feedback),
      e.undo,
    );
    expect(press.execute({ playerId })).toBe(blocked ? "stepped" : "undone");
    if (blocked) expect(e.session.flow).toBe(point);
    else {
      expect(selectionBoxOf(e.session.flow)).toEqual(box);
      expect(e.session.flow).not.toHaveProperty("stepBackTo");
      expect(e.feedback.messages.at(-1)?.message).toBe("undoDone");
      expect(
        [...cellsOf(union)].map((cell) => e.world.stateAt(overworld, cell)),
      ).toEqual(original);
    }
    expect(e.session.hasHistory).toBe(false);
  },
);
