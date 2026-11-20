import fc from "fast-check";
import { expect, it } from "vitest";
import { ConfirmHeighted } from "../../../src/application/build/confirmHeighted";
import { ConfirmShape } from "../../../src/application/build/confirmShape";
import { ConfirmTerrain } from "../../../src/application/build/confirmTerrain";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { EditJobs } from "../../../src/application/build/editJobs";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateSelection } from "../../../src/application/build/rotateSelection";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import {
  boxOf,
  boxWithHeight,
  type CellBox,
  cellsOf,
} from "../../../src/domain/build/box";
import {
  chooseHeighted,
  cornerTaps,
  setHeight,
  tapsOf,
} from "../../../src/domain/build/flow/flow";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { selectionOf } from "../../../src/domain/build/selection";
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
  const rotateBox = new RotateBox(
    repo,
    world,
    players,
    structures,
    feedback,
    log,
  );
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
    rotate: new RotateSelection(repo, rotateBox, feedback),
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
    kind: "selected",
    menuLevel: "build",
    selection: selectionOf(overworld, box, stone),
    from: box.min,
    to: box.max,
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

it("keeps the filled box selected and restores its pre-build selection on Undo", () => {
  const e = setup();
  const box = boxOf({ x: 1, y: 64, z: 2 }, { x: 3, y: 66, z: 5 });
  const selected = {
    kind: "selected",
    menuLevel: "root",
    selection: selectionOf(overworld, box, stone),
  };
  select(e, box);
  e.shape.execute({ playerId, style: "fill" });
  e.drain();
  expect(e.session.flow).toMatchObject(selected);
  const entry = e.session.takeUndo();
  expect(entry).toMatchObject({
    kind: "cells",
    record: { selectionBefore: box, selectionAfter: box },
  });
  if (typeof entry === "string") throw new Error("Expected cell history");
  e.session.putBackUndo(entry);
  expect(e.undo.execute({ playerId })).toEqual({ restoredSelection: box });
  e.drain();
  expect(e.session.flow).toMatchObject(selected);
});

it.each(["endpoint", "heightStep"] as const)(
  "undo reports the box selected at %s confirmation",
  (kind) => {
    const e = setup();
    const base = boxOf({ x: 1, y: 64, z: 2 }, { x: 3, y: 64, z: 5 });
    const box =
      kind === "endpoint" ? base : boxOf(base.min, { ...base.max, y: 67 });
    if (kind === "endpoint") {
      select(e, base);
      e.shape.execute({ playerId, style: "frame" });
    } else {
      select(e, box);
      e.session.setFlow(chooseHeighted(e.session.flow, "cube"));
      e.heighted.execute({ playerId, fill: "fill" });
    }
    e.drain();
    expect(e.undo.execute({ playerId })).toEqual({ restoredSelection: box });
  },
);

it.each([
  { kind: "gable", originalHeight: 5, builtHeight: 3 },
  { kind: "hip", originalHeight: 1, builtHeight: 3 },
  { kind: "sphere", originalHeight: 2, builtHeight: 2 },
] as const)(
  "undo restores the full pre-build $kind selection and confirmation",
  ({ kind, originalHeight, builtHeight }) => {
    const e = setup();
    const base = boxOf({ x: 0, y: 64, z: 0 }, { x: 3, y: 64, z: 1 });
    const before = boxWithHeight(base, originalHeight);
    const built =
      kind === "sphere"
        ? boxOf({ x: 1, y: 64, z: 0 }, { x: 2, y: 65, z: 1 })
        : boxWithHeight(base, builtHeight);
    select(e, before);
    e.session.setFlow(
      setHeight(chooseHeighted(e.session.flow, kind), builtHeight),
    );

    e.heighted.execute({ playerId, fill: "fill" });
    e.drain();
    expect(e.session.flow).toMatchObject({
      kind: "selected",
      menuLevel: "root",
      selection: selectionOf(overworld, built, stone),
    });
    expect(e.session.confirmedBox).toEqual(
      selectionOf(overworld, built, stone),
    );

    expect(e.undo.execute({ playerId })).toEqual({ restoredSelection: before });
    e.drain();
    expect(e.session.flow).toMatchObject({
      kind: "selected",
      menuLevel: "root",
      selection: selectionOf(overworld, before, stone),
    });
    expect(e.session.confirmedBox).toEqual(
      selectionOf(overworld, before, stone),
    );
  },
);

it.each(["frame", "gable"] as const)(
  "undo of %s leaves an unrelated active selection and Copy bounds intact",
  (kind) => {
    const e = setup();
    const base = boxOf({ x: 0, y: 64, z: 0 }, { x: 3, y: 64, z: 4 });
    select(e, base);
    if (kind === "frame") e.shape.execute({ playerId, style: kind });
    else {
      e.session.setFlow(setHeight(chooseHeighted(e.session.flow, kind), 3));
      e.heighted.execute({ playerId, fill: "fill" });
    }
    e.drain();

    const other = boxOf({ x: 10, y: 64, z: 10 }, { x: 13, y: 64, z: 14 });
    const selection = selectionOf(overworld, other, stone);
    e.session.confirmBox(
      selection,
      "selected",
      tapsOf(e.session.flow) ?? cornerTaps(selection.box),
    );
    const flow = e.session.flow;

    expect(e.undo.execute({ playerId })).toEqual({ restoredSelection: base });
    e.drain();
    expect(e.session.flow).toBe(flow);
    expect(e.session.confirmedBox).toBe(selection);
    expect(snapshot(e, base).every((state) => state === AIR)).toBe(true);
  },
);

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
          selection: selectionOf(overworld, box, stone),
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

it("RotateSelection then UndoEdit restores the original arrangement and overwritten neighbors", () => {
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
        }),
      ).toBe("rotated");
      expect(e.session.flow.kind).toBe("selected");
      expect(snapshot(e, union)).not.toEqual(before);
      expect(e.session.hasHistory).toBe(true);
      undoAndExpectEmpty(e);
      expect(snapshot(e, union)).toEqual(before);
      expect(e.structures.live.size).toBe(0);
    }),
  );
});

it("RotateSelection then taps, then one UndoEdit per rotation restores each step back to the original", () => {
  fc.assert(
    fc.property(size, fc.integer({ min: 2, max: 4 }), (width, turns) => {
      const e = setup();
      const box = boxOf({ x: 0, y: 64, z: 0 }, { x: width - 1, y: 65, z: 1 });
      const union = planRotationAboutCenter(box).union;
      const states = [seed(e, union)];
      select(e, box);
      expect(
        e.rotate.execute({
          playerId,
          dimensionId: overworld,
        }),
      ).toBe("rotated");
      states.push(snapshot(e, union));
      for (let n = 1; n < turns; n++) {
        expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
          "rotated",
        );
        states.push(snapshot(e, union));
      }
      expect(e.session.flow).toMatchObject({
        kind: "selected",
        selection: {
          box: turns % 2 === 0 ? box : planRotationAboutCenter(box).target,
        },
      });
      for (let n = turns - 1; n >= 0; n--) {
        e.undo.execute({ playerId });
        e.drain();
        expect(e.feedback.messages.at(-1)?.message).toBe("undoDone");
        expect(snapshot(e, union)).toEqual(states[n]);
      }
      expect(e.session.hasHistory).toBe(false);
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
        selection: selectionOf(overworld, boxOf(floor, floor), stone),
        from: floor,
        to: floor,
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
          selection: selectionOf(overworld, box, stone),
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
