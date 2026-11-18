import fc from "fast-check";
import { expect, it } from "vitest";
import { ConfirmHeighted } from "../../../src/application/build/confirmHeighted";
import { ConfirmShape } from "../../../src/application/build/confirmShape";
import { ConfirmTerrain } from "../../../src/application/build/confirmTerrain";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { EditJobs } from "../../../src/application/build/editJobs";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateBoxAction } from "../../../src/application/build/rotateBoxAction";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, type CellBox, cellsOf } from "../../../src/domain/build/box";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { fillStylesFor } from "../../../src/domain/build/volume/kind";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
const stone = blockStateOf("minecraft:stone");
const size = fc.integer({ min: 3, max: 6 });

function setup() {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const structures = new FakeStructureStore(world);
  const feedback = new FakeFeedback();
  const players = new FakeBuildPlayers();
  const log = { warn: () => {} };
  const jobs = new EditJobs(repo, world, feedback, log, players, structures);
  const session = repo.getOrCreate(playerId);
  return {
    repo,
    world,
    structures,
    feedback,
    session,
    shape: new ConfirmShape(repo, feedback, jobs),
    heighted: new ConfirmHeighted(repo, feedback, jobs),
    terrain: new ConfirmTerrain(repo, feedback, jobs, world),
    copy: new CopyBox(repo, structures, feedback),
    cut: new CutBox(repo, world, structures, feedback, log),
    rotate: new RotateBoxAction(
      repo,
      new RotateBox(repo, world, players, structures, feedback, log),
    ),
    undo: new UndoEdit(repo, feedback, jobs, world, structures, log),
    drain: () => {
      for (let i = 0; i < 1000 && session.isEditing; i++) jobs.step();
      expect(session.isEditing).toBe(false);
    },
  };
}

type Env = ReturnType<typeof setup>;

function snapshot(e: Env, box: CellBox) {
  return [...cellsOf(box)].map((cell) => e.world.stateAt(overworld, cell));
}

function seed(e: Env, box: CellBox) {
  [...cellsOf(box)].forEach((cell, index) => {
    e.world.put(
      cell,
      index % 2 === 0
        ? AIR
        : blockStateOf("minecraft:dirt", { fixture: index }),
    );
  });
  return snapshot(e, box);
}

function select(e: Env, box: CellBox) {
  e.session.setFlow({
    kind: "endpoint",
    dimensionId: overworld,
    from: box.min,
    to: box.max,
    material: stone,
  });
}

function undoAndExpectEmpty(e: Env) {
  e.undo.execute({ playerId });
  e.drain();
  expect(e.feedback.messages.at(-1)?.message).toBe("undoDone");
  expect(e.session.hasHistory).toBe(false);
  e.undo.execute({ playerId });
  expect(e.feedback.messages.at(-1)?.message).toBe("nothingToUndo");
}

it("CutBox then UndoEdit restores the box and consumes only its snapshot", () => {
  fc.assert(
    fc.property(size, size, (width, depth) => {
      const e = setup();
      const box = boxOf(
        { x: -2, y: 64, z: 3 },
        { x: width, y: 65, z: depth + 3 },
      );
      const before = seed(e, box);
      expect(
        e.cut.execute({
          playerId,
          dimensionId: overworld,
          box,
          facing: "east",
        }),
      ).toBe(true);
      expect(snapshot(e, box)).toEqual([...cellsOf(box)].map(() => AIR));
      expect(e.session.hasHistory).toBe(true);
      const clipboard = e.session.clipboard;
      undoAndExpectEmpty(e);
      expect(snapshot(e, box)).toEqual(before);
      expect(e.session.clipboard).toBe(clipboard);
      expect(e.structures.live.size).toBe(1);
    }),
  );
});

it.each(["line Place", "rectangle Fill", "rectangle Frame"] as const)(
  "%s then UndoEdit restores the previous blocks",
  (build) => {
    fc.assert(
      fc.property(size, size, (width, depth) => {
        const e = setup();
        const box = boxOf(
          { x: 0, y: 64, z: 0 },
          { x: width - 1, y: 64, z: build === "line Place" ? 0 : depth - 1 },
        );
        const before = seed(e, box);
        select(e, box);
        e.shape.execute({
          playerId,
          style: build === "rectangle Frame" ? "frame" : "fill",
        });
        e.drain();
        expect(snapshot(e, box)).not.toEqual(before);
        expect(e.session.hasHistory).toBe(true);
        undoAndExpectEmpty(e);
        expect(snapshot(e, box)).toEqual(before);
      }),
    );
  },
);

const heightedBuilds = (
  ["gable", "hip", "cylinder", "sphere", "cube"] as const
).flatMap((kind) => fillStylesFor(kind).map((fill) => ({ kind, fill })));

it.each(heightedBuilds)(
  "confirmed $kind $fill then UndoEdit restores the previous blocks",
  ({ kind, fill }) => {
    fc.assert(
      fc.property(size, size, size, (width, depth, height) => {
        const e = setup();
        const base = boxOf(
          { x: 0, y: 64, z: 0 },
          { x: width - 1, y: 64, z: depth - 1 },
        );
        const box = { min: base.min, max: { ...base.max, y: 64 + height - 1 } };
        const before = seed(e, box);
        e.session.setFlow({
          kind: "heightStep",
          dimensionId: overworld,
          base,
          from: base.min,
          heightedKind: kind,
          previous: height,
          heightLocked: false,
          material: stone,
        });
        e.heighted.execute({ playerId, fill });
        e.drain();
        expect(snapshot(e, box)).not.toEqual(before);
        expect(e.session.hasHistory).toBe(true);
        undoAndExpectEmpty(e);
        expect(snapshot(e, box)).toEqual(before);
      }),
    );
  },
);

it("RotateBoxAction then UndoEdit restores the original arrangement and overwritten neighbors", () => {
  fc.assert(
    fc.property(size, (width) => {
      const e = setup();
      const box = boxOf({ x: 0, y: 64, z: 0 }, { x: width - 1, y: 65, z: 1 });
      const union = planRotationAboutCenter(box).union;
      const before = seed(e, union);
      select(e, box);
      expect(
        e.rotate.execute({
          playerId,
          dimensionId: overworld,
          box,
          facing: "east",
        }),
      ).toBe(true);
      expect(e.session.flow).toMatchObject({ kind: "rotateMode", turn: 1 });
      expect(snapshot(e, union)).not.toEqual(before);
      expect(e.session.hasHistory).toBe(true);
      undoAndExpectEmpty(e);
      expect(snapshot(e, union)).toEqual(before);
      expect(e.structures.live.size).toBe(0);
    }),
  );
});

it.each(["Remove above", "Copy"] as const)(
  "%s leaves empty history unchanged and UndoEdit reports nothing to undo",
  (operation) => {
    const e = setup();
    const floor = { x: 0, y: BUILD_SPEC.worldTopY - 2, z: 0 };
    const above = { ...floor, y: floor.y + 1 };
    const box = boxOf(floor, above);
    e.world.put(floor, stone);
    e.world.put(above, stone);
    const history = e.session.hasHistory;
    if (operation === "Remove above") {
      e.session.setFlow({
        kind: "terrainConfirm",
        dimensionId: overworld,
        from: floor,
        to: floor,
        material: stone,
        op: "removeAbove",
      });
      e.terrain.execute({ playerId });
      e.drain();
      expect(e.world.stateAt(overworld, above)).toEqual(AIR);
      expect(e.feedback.messages.at(-1)).toMatchObject({
        message: "editDoneCount",
        count: 1,
      });
    } else {
      expect(
        e.copy.execute({
          playerId,
          dimensionId: overworld,
          box,
          facing: "east",
        }),
      ).toBe(true);
      expect(e.session.clipboard).toBeDefined();
      expect(e.feedback.messages.at(-1)?.message).toBe("copied");
    }
    const after = snapshot(e, box);
    const writes = e.world.writes;
    expect(e.session.hasHistory).toBe(history);
    e.undo.execute({ playerId });
    e.drain();
    expect(e.feedback.messages.at(-1)?.message).toBe("nothingToUndo");
    expect(e.session.hasHistory).toBe(history);
    expect(snapshot(e, box)).toEqual(after);
    expect(e.world.writes).toBe(writes);
  },
);
