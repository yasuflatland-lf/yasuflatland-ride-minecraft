import fc from "fast-check";
import { expect, it } from "vitest";
import { ChooseTerrain } from "../../../src/application/build/chooseTerrain";
import { ConfirmLiveHeight } from "../../../src/application/build/confirmLiveHeight";
import { ConfirmShape } from "../../../src/application/build/confirmShape";
import { ConfirmTerrain } from "../../../src/application/build/confirmTerrain";
import { EditJobs } from "../../../src/application/build/editJobs";
import { SetPoint } from "../../../src/application/build/setPoint";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import { SCAN_STEP } from "../../../src/domain/build/edit/change";
import { setHeight } from "../../../src/domain/build/flow/heightFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { Cell } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { NETHER_RANGE, OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import {
  confirmEndpointHeight,
  tapAir,
  tapBlock,
} from "../../support/buildSelection";
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
const dirt = blockStateOf("minecraft:dirt");
const top = OVERWORLD_RANGE.maxY;

function setup(dimensionId = overworld) {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  const world = new FakeWorld();
  world.heightRanges.set(nether, NETHER_RANGE);
  const players = new FakeBuildPlayers();
  const jobs = new EditJobs(repo, world, feedback, { warn: () => {} }, players);
  const session = repo.getOrCreate(playerId);
  const range = world.heightRange(dimensionId);
  const select = (from: Cell, to: Cell) => {
    session.setFlow(
      confirmEndpointHeight(
        tapAir(
          tapBlock({ kind: "idle" }, dimensionId, from, stone, range),
          to,
          range,
        ),
      ),
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
    choose: new ChooseTerrain(repo, feedback, world),
    confirm: new ConfirmTerrain(repo, feedback, jobs, world),
    fill: new ConfirmShape(repo, feedback, jobs),
    undo: new UndoEdit(repo, feedback, jobs, world, new FakeStructureStore(), {
      warn: () => {},
    }),
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

it("keeps the original box selected after Remove above", () => {
  const e = setup();
  const from = { x: 0, y: 60, z: 0 };
  const to = { x: 2, y: 64, z: 2 };
  e.select(from, to);
  removeAbove(e);
  expect(e.session.isEditing).toBe(true);
  e.drain();
  expect(e.session.flow).toMatchObject({
    kind: "selected",
    selection: { box: boxOf(from, to) },
  });
  expect(e.session.confirmedBox).toEqual({
    material: stone,
    dimensionId: overworld,
    box: boxOf(from, to),
  });
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

it("refuses a terrain operation exactly when either footprint side exceeds the limit", () => {
  const limit = BUILD_SPEC.maxTerrainSide;
  const bottom = OVERWORLD_RANGE.minY;
  fc.assert(
    fc.property(
      fc.constantFrom("removeAbove" as const, "fillBelow" as const),
      fc.constantFrom("x" as const, "z" as const),
      fc.integer({ min: 1, max: limit * 2 }),
      fc.integer({ min: 1, max: limit }),
      (op, axis, length, width) => {
        const e = setup();
        const from = { x: 0, y: bottom, z: 0 };
        const to = {
          x: width - 1,
          y: bottom,
          z: width - 1,
          [axis]: length - 1,
        };
        e.select(from, to);
        const flow = e.session.flow;
        e.choose.execute({ playerId, op });
        expect(e.world.writes).toBe(0);
        expect(e.session.isEditing).toBe(false);
        if (length > limit) {
          expect(e.session.flow).toBe(flow);
          expect(e.feedback.messages.at(-1)).toMatchObject({
            message: "tooLarge",
            count: length * width * (op === "fillBelow" ? 1 : top - bottom),
          });
        } else {
          expect(e.session.flow).toMatchObject({ kind: "terrainConfirm", op });
          e.confirm.execute({ playerId });
          expect(e.session.isEditing).toBe(true);
          expect(e.feedback.messages.at(-1)?.message).toBe(
            op === "fillBelow" ? "building" : "removing",
          );
        }
      },
    ),
    {
      examples: [
        ["removeAbove", "x", limit, limit],
        ["fillBelow", "z", limit, limit],
        ["removeAbove", "z", limit + 1, 1],
        ["fillBelow", "x", limit + 1, 1],
      ],
    },
  );
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
  expect(e.session.flow).toMatchObject({
    kind: "selected",
    selection: { box: boxOf(from, to) },
  });
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

it.each([
  { material: AIR, barrier: "protected" },
  { material: blockStateOf("minecraft:water"), barrier: "unreadable" },
  { material: blockStateOf("minecraft:lava"), barrier: "solid" },
])(
  "fills $material.typeId up to a $barrier barrier",
  ({ material, barrier }) => {
    const e = setup();
    const start = { x: 0, y: -61, z: 0 };
    const wall = { x: 0, y: -62, z: 0 };
    e.select(start, start);
    e.world.put(start, material);
    if (barrier === "protected") e.world.protectedCells.add(cellKey(wall));
    if (barrier === "unreadable") e.world.unreadableCells.add(cellKey(wall));
    if (barrier === "solid") e.world.put(wall, dirt);
    fillBelow(e);
    e.drain();
    expect(e.world.stateAt(overworld, start)).toEqual(stone);
    expect(e.world.stateAt(overworld, { ...wall, y: wall.y - 1 })).toEqual(AIR);
    expect(e.world.writes).toBe(1);
    expect(e.feedback.messages.at(-1)).toMatchObject({
      message: "editDoneCount",
      count: 1,
    });
    expect(e.session.hasHistory).toBe(false);
    expect(e.feedback.undoHints).toEqual([]);
    expect(e.session.confirmedBox?.box).toEqual(boxOf(start, start));
  },
);

it("stops terrain edits at both Nether height limits", () => {
  const e = setup(nether);
  const floor = { x: 0, y: NETHER_RANGE.minY, z: 0 };
  const ceiling = { ...floor, y: NETHER_RANGE.maxY };
  const above = { ...ceiling, y: ceiling.y + 1 };
  e.world.put(ceiling, stone);
  e.world.put(above, stone);
  e.select(floor, floor);
  removeAbove(e);
  e.drain();
  expect(e.world.stateAt(nether, ceiling)).toEqual(AIR);
  expect(e.world.stateAt(nether, above)).toEqual(stone);
  fillBelow(e);
  e.drain();
  expect(e.world.stateAt(nether, floor)).toEqual(stone);
  expect(e.world.stateAt(nether, { ...floor, y: floor.y - 1 })).toEqual(AIR);
});

it("refuses an unstable material at menu choice without changing flow", () => {
  const e = setup();
  e.session.setFlow(
    confirmEndpointHeight(
      tapAir(
        tapBlock(
          { kind: "idle" },
          overworld,
          { x: 0, y: 0, z: 0 },
          blockStateOf("minecraft:sand"),
        ),
        { x: 1, y: 0, z: 1 },
      ),
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
  const box = boxOf({ x: 0, y: -64, z: 0 }, { x: 0, y: -61, z: 0 });
  e.select(box.min, box.max);
  fillBelow(e);
  e.drain();
  expect(e.session.confirmedBox?.box).toEqual(box);
  expect(e.session.flow).toMatchObject({
    kind: "selected",
    selection: { box },
  });
  expect(e.feedback.messages.at(-1)).toMatchObject({
    message: "editDoneCount",
    count: 4,
  });
  expect(e.players.moves).toEqual([{ playerId, cell: { x: 0, y: -60, z: 0 } }]);
  expect(e.feedback.undoHints).toHaveLength(0);
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

it("budgets scans and writes together on a maximum-size fill", () => {
  const e = setup();
  e.select({ x: 0, y: top, z: 0 }, { x: 31, y: top, z: 31 });
  fillBelow(e);
  e.jobs.step();
  expect(e.world.writes).toBe(BUILD_SPEC.blocksPerTick / 2);
  expect(e.session.isEditing).toBe(true);
  e.drain();
  expect(e.world.writes).toBe(32 * 32 * (top - OVERWORLD_RANGE.minY + 1));
});

it.each([
  [overworld, OVERWORLD_RANGE],
  [nether, NETHER_RANGE],
] as const)(
  "reports the entire Fill below prism across unequal endpoints in %s",
  (dimensionId, { minY, maxY }) => {
    for (const lowerY of [minY, Math.floor((minY + maxY) / 2), maxY]) {
      for (const reversed of [false, true]) {
        const e = setup(dimensionId);
        const low = { x: 0, y: lowerY, z: 0 };
        const high = { x: 32, y: maxY, z: 0 };
        e.select(reversed ? high : low, reversed ? low : high);
        e.choose.execute({ playerId, op: "fillBelow" });
        expect(e.feedback.messages.at(-1)).toMatchObject({
          message: "tooLarge",
          count: 33 * (maxY - minY + 1),
        });
      }
    }
  },
);

it("keeps the confirmed box for Copy while Fill below uses the original corners", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 8 }), (height) => {
      const e = setup();
      const from = { x: 0, y: 60, z: 0 };
      const to = { x: 2, y: 60, z: 2 };
      const above = { ...from, y: from.y + 1 };
      const point = tapBlock({ kind: "idle" }, overworld, from, stone);
      e.session.setFlow(setHeight(tapAir(point, to), height));
      new ConfirmLiveHeight(e.repo).execute({ playerId });
      e.choose.execute({ playerId, op: "fillBelow" });
      e.confirm.execute({ playerId });
      e.drain();
      expect(e.world.stateAt(overworld, above)).toEqual(AIR);
      expect(e.session.confirmedBox?.box).toEqual(
        boxOf(from, { ...to, y: from.y + height - 1 }),
      );
    }),
  );
});
