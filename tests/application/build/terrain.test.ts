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
import { SCAN_STEP } from "../../../src/domain/build/edit/change";
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
  FakeBuildPlayers,
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
  const players = new FakeBuildPlayers();
  const jobs = new EditJobs(repo, world, feedback, { warn: () => {} }, players);
  const session = repo.getOrCreate(playerId);
  const select = (from: Cell, to: Cell) => {
    session.setFlow(
      tapAir(tapBlock({ kind: "idle" }, overworld, from, stone), to),
    );
  };
  return {
    repo,
    players,
    jobs,
    feedback,
    world,
    session,
    select,
    choose: new ChooseTerrain(repo, feedback),
    confirm: new ConfirmTerrain(repo, feedback, jobs, world),
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

it.each([60, top])(
  "refuses while another edit runs with a floor at y=%s and returns to aiming",
  (y) => {
    const e = setup();
    const from = { x: 0, y, z: 0 };
    e.select(from, { x: 1, y, z: 1 });
    e.choose.execute({ playerId, op: "removeAbove" });
    expect(e.session.beginEdit()).toBeUndefined();
    e.confirm.execute({ playerId });
    expect(e.feedback.messages.at(-1)?.message).toBe("busy");
    expect(e.session.flow).toMatchObject({ kind: "point1", cell: from });
    expect(e.session.confirmedBox).toBeUndefined();
    expect(e.session.isEditing).toBe(true);
  },
);

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

const fillBelow = (e: ReturnType<typeof setup>) => {
  e.choose.execute({ playerId, op: "fillBelow" });
  e.confirm.execute({ playerId });
};

it("fills air and liquids but treats protected, unreadable, and solid cells as barriers", () => {
  for (const barrier of ["protected", "unreadable", "solid"] as const) {
    const e = setup();
    const top = { x: 0, y: -61, z: 0 };
    const wall = { x: 0, y: -62, z: 0 };
    e.select(top, top);
    e.world.put(top, blockStateOf("minecraft:water"));
    if (barrier === "protected") e.world.protectedCells.add(cellKey(wall));
    if (barrier === "unreadable") e.world.unreadableCells.add(cellKey(wall));
    if (barrier === "solid") e.world.put(wall, dirt);
    fillBelow(e);
    e.drain();
    expect(e.world.stateAt(overworld, top)).toEqual(stone);
    expect(e.world.stateAt(overworld, { x: 0, y: -63, z: 0 })).toEqual(AIR);
    expect(e.world.writes).toBe(1);
  }
});

it("refuses an unstable material at menu choice without changing flow", () => {
  const e = setup();
  e.session.setFlow(
    tapAir(
      tapBlock(
        { kind: "idle" },
        overworld,
        { x: 0, y: 0, z: 0 },
        blockStateOf("minecraft:sand"),
      ),
      { x: 1, y: 0, z: 1 },
    ),
  );
  const flow = e.session.flow;
  e.choose.execute({ playerId, op: "fillBelow" });
  expect(e.session.flow).toBe(flow);
  expect(e.feedback.messages.at(-1)?.message).toBe("fillMaterialRefused");
  expect(e.world.writes).toBe(0);
});

it("keeps earlier history and moves its buried owner above the inclusive top layer", () => {
  const e = setup();
  const old = { x: 10, y: 0, z: 10 };
  e.select(old, old);
  e.fill.execute({ playerId, style: "fill" });
  e.drain();
  const feet = { x: 0, y: -63, z: 0 };
  e.players.occupants.set(playerId, { dimensionId: overworld, feet });
  e.select({ x: 0, y: -64, z: 0 }, { x: 0, y: -61, z: 0 });
  fillBelow(e);
  expect(e.session.confirmedBox?.box.max.y).toBe(-61);
  expect(e.session.flow.kind).toBe("idle");
  e.drain();
  expect(e.feedback.messages.at(-1)).toMatchObject({
    message: "editDoneCount",
    count: 4,
  });
  expect(e.players.moves).toEqual([{ playerId, cell: { x: 0, y: -60, z: 0 } }]);
  expect(e.feedback.undoHints).toHaveLength(1);
  e.undo.execute({ playerId });
  e.drain();
  expect(e.world.stateAt(overworld, old)).toEqual(AIR);
  expect(e.world.stateAt(overworld, feet)).toEqual(stone);
  expect(e.session.hasHistory).toBe(false);
});

it("charges scan steps even when no writes are planned", () => {
  const e = setup();
  let reads = 0;
  function* scans(): Iterable<typeof SCAN_STEP> {
    for (let i = 0; i < BUILD_SPEC.blocksPerTick + 1; i++) {
      reads++;
      yield SCAN_STEP;
    }
  }
  e.session.beginEdit();
  e.jobs.start(playerId, overworld, scans(), "irreversible");
  e.jobs.step();
  expect(reads).toBe(BUILD_SPEC.blocksPerTick);
  expect(e.world.writes).toBe(0);
  expect(e.session.isEditing).toBe(true);
  e.jobs.step();
  expect(reads).toBe(BUILD_SPEC.blocksPerTick + 1);
  expect(e.session.isEditing).toBe(false);
});

it("fills fluids but treats solid, protected and unreadable cells as barriers", () => {
  const e = setup();
  const y = BUILD_SPEC.worldBottomY + 2;
  for (let x = 0; x < 4; x++) e.world.put({ x, y: y + 1, z: 0 }, dirt);
  e.world.put({ x: 0, y, z: 0 }, blockStateOf("minecraft:water"));
  e.world.put({ x: 1, y, z: 0 }, blockStateOf("minecraft:lava"));
  e.world.protectedCells.add(cellKey({ x: 2, y, z: 0 }));
  e.world.unreadableCells.add(cellKey({ x: 3, y, z: 0 }));
  // A solid layer below prevents the search from reaching behind these barriers.
  for (let x = 0; x < 4; x++) e.world.put({ x, y: y - 1, z: 0 }, dirt);
  e.select({ x: 0, y: y - 1, z: 0 }, { x: 3, y, z: 0 });
  fillBelow(e);
  e.drain();
  expect(e.world.writes).toBe(2);
  expect(e.feedback.messages.at(-1)).toMatchObject({
    message: "editDoneCount",
    count: 2,
  });
  expect(e.session.hasHistory).toBe(false);
  expect(e.feedback.undoHints).toEqual([]);
  expect(e.session.confirmedBox?.box).toEqual(
    boxOf({ x: 0, y: y - 1, z: 0 }, { x: 3, y, z: 0 }),
  );
});

it("budgets scans and writes together on a maximum-size fill", () => {
  const e = setup();
  e.select({ x: 0, y: top, z: 0 }, { x: 31, y: top, z: 31 });
  fillBelow(e);
  e.jobs.step();
  expect(e.world.writes).toBe(BUILD_SPEC.blocksPerTick / 2);
  expect(e.session.isEditing).toBe(true);
  e.drain();
  expect(e.world.writes).toBe(32 * 32 * (top - BUILD_SPEC.worldBottomY + 1));
});

it("refuses either oversized Fill below side without writes", () => {
  for (const to of [
    { x: 32, y: 0, z: 0 },
    { x: 0, y: 0, z: 32 },
  ]) {
    const e = setup();
    e.select({ x: 0, y: 0, z: 0 }, to);
    const flow = e.session.flow;
    e.choose.execute({ playerId, op: "fillBelow" });
    expect(e.session.flow).toBe(flow);
    expect(e.feedback.messages.at(-1)).toMatchObject({
      message: "tooLarge",
      count: 33 * (1 - BUILD_SPEC.worldBottomY),
    });
    expect(e.world.writes).toBe(0);
  }
});

it("reports the entire Fill below prism at the world ceiling and across unequal endpoints", () => {
  for (const lowerY of [BUILD_SPEC.worldBottomY, 0, top]) {
    for (const reversed of [false, true]) {
      const e = setup();
      const low = { x: 0, y: lowerY, z: 0 };
      const high = { x: 32, y: top, z: 0 };
      e.select(reversed ? high : low, reversed ? low : high);
      e.choose.execute({ playerId, op: "fillBelow" });
      expect(e.feedback.messages.at(-1)).toMatchObject({
        message: "tooLarge",
        count: 33 * (top - BUILD_SPEC.worldBottomY + 1),
      });
    }
  }
});
