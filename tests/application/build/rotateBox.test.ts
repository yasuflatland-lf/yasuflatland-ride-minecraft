import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  boxOf,
  type CellBox,
  cellsOf,
  contains,
  volume,
} from "../../../src/domain/build/box";
import {
  type BuildFlow,
  selectionBoxOf,
} from "../../../src/domain/build/flow/flow";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
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
    kind: "endpoint",
    dimensionId: overworld,
    from: box.min,
    to: box.max,
    material: stone,
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
      const capture = vi.spyOn(e.structures, "capture");
      expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
        "rotated",
      );
      expect(mayEdit.mock.calls).toEqual(
        [...cellsOf(plan.union)].map((cell) => [overworld, cell]),
      );
      expect(writes).toHaveBeenCalledTimes(2 * volume(box));
      for (const [, cell] of writes.mock.calls)
        expect(contains(plan.union, cell)).toBe(true);
      const snapshot = capture.mock.results[0]?.value;
      const source = capture.mock.results[1]?.value;
      const placed = e.structures.calls.find((call) => call.kind === "place");
      expect(placed).toMatchObject({
        kind: "place",
        handle: source,
        dimensionId: overworld,
        anchor: plan.target.min,
        turn: 1,
      });
      if (placed?.kind !== "place")
        throw new Error("Missing rotated placement");
      expect(e.structures.calls).toEqual([
        {
          kind: "capture",
          dimensionId: overworld,
          box: plan.union,
          ownerId: playerId,
        },
        { kind: "capture", dimensionId: overworld, box, ownerId: playerId },
        { kind: "clearEntities", dimensionId: overworld, box },
        { kind: "clearBlocks", dimensionId: overworld, box },
        placed,
        { kind: "discard", handle: placed.handle },
      ]);
      expect(e.structures.live.size).toBe(1);
      expect([...e.structures.live]).toEqual([snapshot]);
      expect(e.structures.live.has(placed.handle)).toBe(false);
      expect(e.session.takeUndo()).toEqual({
        kind: "snapshot",
        snapshot: { dimensionId: overworld, box: plan.union, handle: snapshot },
      });
      expect(e.session.takeUndo()).toBe("nothingToUndo");
      expect(selectionBoxOf(e.session.flow)).toEqual(plan.target);
      expect(e.session.flow).toMatchObject({
        kind: "endpoint",
        dimensionId: overworld,
        material: stone,
      });
      expect(e.feedback.messages).toEqual([
        { message: "rotateDone", count: volume(box) },
      ]);
      expect(e.log.warn).not.toHaveBeenCalled();
    }),
  );
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
      expect(e.structures.calls.map((call) => call.kind)).toEqual(
        second ? ["capture", "capture", "discard"] : ["capture"],
      );
      expect(e.structures.live.size).toBe(0);
      expect(e.world.writes).toBe(0);
      expect(e.session).toEqual(before);
      expect(e.session.flow).toBe(flow);
      expect(e.session.hasHistory).toBe(false);
      expect(e.feedback.messages).toEqual([
        {
          message: "rotateTooLarge",
          count: volume(planRotationAboutCenter(wideBox).union),
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
      kind: "endpoint",
      dimensionId: nether,
      from: wideBox.min,
      to: wideBox.max,
      material: stone,
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
    const previous = e.structures.capture(overworld, wideBox, playerId);
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
    expect(e.structures.calls.map((call) => call.kind)).toEqual([
      "capture",
      "capture",
      "clearEntities",
      "clearBlocks",
      ...(failure === "place" ? ["place"] : []),
      "clearEntities",
      "place",
      "discard",
      "discard",
    ]);
    const restore = e.structures.calls
      .filter((call) => call.kind === "place")
      .at(-1);
    expect(restore).toMatchObject({
      kind: "place",
      handle: capture.mock.results[0]?.value,
      dimensionId: overworld,
      anchor: union.min,
      turn: 0,
    });
    if (restore?.kind !== "place") throw new Error("Missing restoration");
    expect(e.structures.calls.at(-1)).toEqual({
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
  const previous = e.structures.capture(overworld, wideBox, playerId);
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
