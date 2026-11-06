import fc from "fast-check";
import { expect, it } from "vitest";
import { ChooseTerrain } from "../../../src/application/build/chooseTerrain";
import { ConfirmShape } from "../../../src/application/build/confirmShape";
import { ConfirmTerrain } from "../../../src/application/build/confirmTerrain";
import { EditJobs } from "../../../src/application/build/editJobs";
import { SetPoint } from "../../../src/application/build/setPoint";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf, volume } from "../../../src/domain/build/box";
import {
  type BuildFlow,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { Cell } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  cellKey,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";

const playerId = asPlayerId("alex");
const stone = blockStateOf("minecraft:stone");
const dirt = blockStateOf("minecraft:dirt");
const top = BUILD_SPEC.worldTopY;

function setup() {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  const world = new FakeWorld();
  const jobs = new EditJobs(repo, world, feedback, { warn: () => {} });
  const session = repo.getOrCreate(playerId);
  const select = (from: Cell, to: Cell) => {
    session.setFlow(
      tapAir(tapBlock({ kind: "idle" }, overworld, from, stone), to),
    );
  };
  return {
    repo,
    feedback,
    world,
    session,
    select,
    choose: new ChooseTerrain(repo, feedback),
    confirm: new ConfirmTerrain(repo, feedback, jobs),
    fill: new ConfirmShape(repo, feedback, jobs),
    undo: new UndoEdit(repo, feedback, jobs),
    setPoint: new SetPoint(repo, world, feedback),
    drain: () => {
      while (session.isEditing) jobs.step();
    },
  };
}

const removeAbove = (e: ReturnType<typeof setup>) => {
  e.choose.execute({ playerId, op: "removeAbove" });
  e.confirm.execute({ playerId });
};

it("keeps the floor and clears everything above it to the world top, whichever point is lower", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 0, max: 5 }),
      fc.boolean(),
      (sx, sz, rise, reversed) => {
        const e = setup();
        const low = { x: 0, y: 60, z: 0 };
        const high = { x: sx - 1, y: 60 + rise, z: sz - 1 };
        const floor = { x: 0, y: 60, z: 0 };
        const above = { x: sx - 1, y: 61, z: sz - 1 };
        const ceiling = { x: 0, y: top, z: 0 };
        const outside = { x: sx, y: 61, z: 0 };
        const below = { x: 0, y: 59, z: 0 };
        for (const cell of [floor, above, ceiling, outside, below])
          e.world.put(cell, stone);
        e.select(reversed ? high : low, reversed ? low : high);
        removeAbove(e);
        expect(e.feedback.messages.at(-1)?.message).toBe("removing");
        e.drain();
        expect(e.world.stateAt(overworld, floor)).toEqual(stone);
        expect(e.world.stateAt(overworld, above)).toEqual(AIR);
        expect(e.world.stateAt(overworld, ceiling)).toEqual(AIR);
        expect(e.world.stateAt(overworld, outside)).toEqual(stone);
        expect(e.world.stateAt(overworld, below)).toEqual(stone);
      },
    ),
  );
});

it("confirms the selected box and returns to idle when the job starts", () => {
  const e = setup();
  const from = { x: 0, y: 60, z: 0 };
  const to = { x: 2, y: 64, z: 2 };
  e.select(from, to);
  removeAbove(e);
  expect(e.session.flow.kind).toBe("idle");
  expect(e.session.confirmedBox).toEqual({
    dimensionId: overworld,
    box: boxOf(from, to),
  });
  expect(e.session.isEditing).toBe(true);
  e.drain();
});

it("finishes with the count message, adds no history, and takes no Undo hint", () => {
  const e = setup();
  e.world.put({ x: 0, y: 61, z: 0 }, stone);
  e.world.put({ x: 0, y: 62, z: 0 }, stone);
  e.select({ x: 0, y: 60, z: 0 }, { x: 0, y: 60, z: 0 });
  removeAbove(e);
  e.drain();
  expect(e.feedback.messages.at(-1)).toMatchObject({
    message: "editDoneCount",
    count: 2,
  });
  expect(e.session.hasHistory).toBe(false);
  expect(e.feedback.undoHints).toEqual([]);
});

it("leaves an earlier edit undoable and skips the cells Remove above changed", () => {
  const e = setup();
  const line = [
    ...cellsOf(boxOf({ x: 0, y: 61, z: 0 }, { x: 5, y: 61, z: 0 })),
  ];
  for (const cell of line) e.world.put(cell, dirt);
  e.select(line[0] as Cell, line[5] as Cell);
  e.fill.execute({ playerId, style: "fill" });
  e.drain();
  expect(e.session.hasHistory).toBe(true);
  e.select({ x: 0, y: 60, z: 0 }, { x: 2, y: 60, z: 0 });
  removeAbove(e);
  e.drain();
  expect(e.session.hasHistory).toBe(true);
  e.undo.execute({ playerId });
  e.drain();
  expect(e.feedback.messages.at(-1)).toMatchObject({
    message: "undoDonePartial",
    count: 3,
    skippedCount: 3,
  });
  expect(line.map((cell) => e.world.stateAt(overworld, cell))).toEqual([
    AIR,
    AIR,
    AIR,
    dirt,
    dirt,
    dirt,
  ]);
  expect(e.session.hasHistory).toBe(false);
});

it("keeps protected and kept cells and clears the rest", () => {
  const e = setup();
  const chest = { x: 0, y: 61, z: 0 };
  const laid = { x: 1, y: 61, z: 0 };
  const open = { x: 2, y: 61, z: 0 };
  const chestState = blockStateOf("minecraft:chest");
  e.world.put(chest, chestState);
  e.world.put(laid, stone);
  e.world.put(open, stone);
  e.world.protectedCells.add(cellKey(laid));
  e.select({ x: 0, y: 60, z: 0 }, { x: 2, y: 60, z: 0 });
  removeAbove(e);
  e.drain();
  expect(e.world.stateAt(overworld, chest)).toEqual(chestState);
  expect(e.world.stateAt(overworld, laid)).toEqual(stone);
  expect(e.world.stateAt(overworld, open)).toEqual(AIR);
});

it("reports an over-limit side as too large and keeps the flow, at either side, with the box volume", () => {
  const limit = BUILD_SPEC.maxTerrainSide;
  for (const [x, z] of [
    [limit, 0],
    [0, limit],
  ] as const) {
    const e = setup();
    const from = { x: 0, y: 60, z: 0 };
    e.select(from, { x, y: 60, z });
    const flow = e.session.flow;
    e.choose.execute({ playerId, op: "removeAbove" });
    expect(e.session.flow).toBe(flow);
    expect(e.session.isEditing).toBe(false);
    expect(e.feedback.messages.at(-1)).toMatchObject({
      message: "tooLarge",
      count: volume(boxOf({ x: 0, y: 61, z: 0 }, { x, y: top, z })),
    });
  }
});

it("accepts a footprint at the limit even though its column exceeds maxVolume", () => {
  const limit = BUILD_SPEC.maxTerrainSide;
  const e = setup();
  e.select({ x: 0, y: -64, z: 0 }, { x: limit - 1, y: -64, z: limit - 1 });
  expect(limit * limit * (top + 64)).toBeGreaterThan(BUILD_SPEC.maxVolume);
  removeAbove(e);
  expect(e.feedback.messages.at(-1)?.message).toBe("removing");
  e.drain();
  expect(e.feedback.messages.at(-1)?.message).toBe("editDoneCount");
});

it("refuses while another edit runs, leaves the running edit alone, and returns to aiming", () => {
  const e = setup();
  const from = { x: 0, y: 60, z: 0 };
  e.select(from, { x: 1, y: 60, z: 1 });
  e.choose.execute({ playerId, op: "removeAbove" });
  expect(e.session.beginEdit()).toBeUndefined();
  e.confirm.execute({ playerId });
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.flow).toMatchObject({ kind: "point1", cell: from });
  expect(e.session.confirmedBox).toBeUndefined();
  expect(e.session.isEditing).toBe(true);
});

it("starts no edit when the floor is the world top", () => {
  const e = setup();
  const from = { x: 0, y: top, z: 0 };
  const to = { x: 2, y: top, z: 2 };
  e.select(from, to);
  removeAbove(e);
  expect(e.session.isEditing).toBe(false);
  expect(e.session.flow.kind).toBe("idle");
  expect(e.session.confirmedBox?.box).toEqual(boxOf(from, to));
  expect(e.feedback.messages.at(-1)).toMatchObject({
    message: "editDoneCount",
    count: 0,
  });
});

it("reports no selection and changes nothing outside its own flow state", () => {
  const flows: BuildFlow[] = [
    { kind: "idle" },
    tapBlock({ kind: "idle" }, overworld, { x: 0, y: 0, z: 0 }, stone),
  ];
  for (const flow of flows) {
    const e = setup();
    e.session.setFlow(flow);
    e.choose.execute({ playerId, op: "removeAbove" });
    e.confirm.execute({ playerId });
    expect(e.session.flow).toBe(flow);
    expect(e.session.isEditing).toBe(false);
    expect(e.feedback.messages.map((m) => m.message)).toEqual([
      "noSelection",
      "noSelection",
    ]);
  }
});

it("ignores a block tap during the confirmation", () => {
  const e = setup();
  e.select({ x: 0, y: 60, z: 0 }, { x: 1, y: 60, z: 1 });
  e.choose.execute({ playerId, op: "removeAbove" });
  const flow = e.session.flow;
  e.world.put({ x: 5, y: 60, z: 5 }, stone);
  e.setPoint.execute({
    playerId,
    dimensionId: overworld,
    cell: { x: 5, y: 60, z: 5 },
  });
  expect(e.session.flow).toBe(flow);
  expect(e.feedback.messages).toEqual([]);
});
