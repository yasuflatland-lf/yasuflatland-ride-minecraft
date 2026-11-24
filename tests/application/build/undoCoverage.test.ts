import fc from "fast-check";
import { expect, it } from "vitest";
import { BackToAiming } from "../../../src/application/build/backToAiming";
import { ChooseAdjustHeight } from "../../../src/application/build/chooseAdjustHeight";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { ChooseStairs } from "../../../src/application/build/chooseStairs";
import { ChooseTerrain } from "../../../src/application/build/chooseTerrain";
import { ConfirmHeighted } from "../../../src/application/build/confirmHeighted";
import { ConfirmLiveHeight } from "../../../src/application/build/confirmLiveHeight";
import { ConfirmShape } from "../../../src/application/build/confirmShape";
import { ConfirmTerrain } from "../../../src/application/build/confirmTerrain";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { EditJobs } from "../../../src/application/build/editJobs";
import { FixStairGoal } from "../../../src/application/build/fixStairGoal";
import { OpenBuildMenu } from "../../../src/application/build/openBuildMenu";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { PressUndo } from "../../../src/application/build/pressUndo";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateSelection } from "../../../src/application/build/rotateSelection";
import { SetPoint } from "../../../src/application/build/setPoint";
import { StepBackSelection } from "../../../src/application/build/stepBackSelection";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import {
  boxFromSize,
  boxOf,
  boxWithHeight,
  type CellBox,
  cellsOf,
  unionOf,
} from "../../../src/domain/build/box";
import {
  adjustHeight,
  confirmLiveHeight,
  setHeight,
} from "../../../src/domain/build/flow/heightFlow";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { cornerTaps, type Taps } from "../../../src/domain/build/flow/taps";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { selectionOf } from "../../../src/domain/build/selection";
import { fillStylesFor } from "../../../src/domain/build/volume/kind";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import {
  chooseHeightedFlow,
  confirmEndpointHeight,
  tapAir,
  tapBlock,
  tappedSelection,
} from "../../support/buildSelection";
import {
  FakeAimReader,
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
  const world = new FakeWorld();
  const structures = new FakeStructureStore(world);
  const repo = new FakeSessions(structures);
  const feedback = new FakeFeedback();
  const players = new FakeBuildPlayers();
  const log = { warn: () => {} };
  const jobs = new EditJobs(repo, world, feedback, log, players);
  const rotateBox = new RotateBox(
    repo,
    world,
    players,
    structures,
    feedback,
    log,
  );
  const session = repo.getOrCreate(playerId);
  const undo = new UndoEdit(repo, feedback, jobs, world, structures, log);
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
    rotate: new RotateSelection(repo, rotateBox, feedback, world),
    paste: new PasteAt(repo, world, feedback, structures, players),
    undo,
    pressUndo: new PressUndo(new StepBackSelection(repo, feedback), undo),
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
    ...tappedSelection(selectionOf(overworld, box, stone), box.min, box.max),
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

it("Build Undo restores blocks after paste selects its result", () => {
  const e = setup();
  const source = boxOf({ x: 0, y: 64, z: 0 }, { x: 2, y: 64, z: 0 });
  const target = boxOf({ x: 5, y: 64, z: 0 }, { x: 7, y: 64, z: 0 });
  const before = seed(e, target);
  const point = tapBlock({ kind: "idle" }, overworld, source.min, stone);
  e.session.setFlow(tapAir(point, source.max));
  for (const cell of cellsOf(source)) e.world.put(cell, stone);
  expect(
    e.copy.execute({
      playerId,
      facing: "east",
      selection: selectionOf(overworld, source, stone),
    }),
  ).toBe(true);
  expect(
    e.paste.execute({
      playerId,
      dimensionId: overworld,
      target: { anchor: target.min, box: target, turn: 0 },
    }),
  ).toBe("pasted");
  expect(e.session.flow.kind).toBe("selected");
  expect(snapshot(e, target)).not.toEqual(before);

  expect(e.pressUndo.execute({ playerId })).toBe("undone");
  e.drain();
  expect(e.feedback.messages.at(-1)?.message).toBe("undoDone");
  expect(e.session.hasHistory).toBe(false);
  expect(snapshot(e, target)).toEqual(before);
});

const builds = [
  { kind: "line", style: "fill" },
  { kind: "rectangle", style: "fill" },
  { kind: "rectangle", style: "frame" },
  { kind: "box", style: "fill" },
  { kind: "box", style: "walls" },
  { kind: "box", style: "faces" },
  ...(
    [
      "gable",
      "hip",
      "cube",
      "sphere",
      "cylinder",
      "sideCylinderX",
      "sideCylinderZ",
    ] as const
  ).flatMap((kind) => fillStylesFor(kind).map((fill) => ({ kind, fill }))),
] as const;

it.each(builds)(
  "Build Undo restores the blocks and pre-build selection for %j",
  (build) => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: -20, max: 20 }),
          y: fc.integer({ min: 50, max: 70 }),
          z: fc.integer({ min: -20, max: 20 }),
        }),
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        size,
        (origin, width, depth, originalHeight, chosenHeight) => {
          const e = setup();
          const base = boxFromSize(origin, {
            x: width,
            y: 1,
            z: build.kind === "line" ? 1 : depth,
          });
          const height =
            build.kind === "line" || build.kind === "rectangle"
              ? 1
              : build.kind === "box"
                ? Math.max(2, originalHeight)
                : originalHeight;
          const before = boxWithHeight(base, height);
          const region = boxWithHeight(base, Math.max(height, chosenHeight));
          const blocks = seed(e, region);
          const first = tapBlock(
            { kind: "idle" },
            overworld,
            before.max,
            stone,
          );
          e.session.setFlow(confirmEndpointHeight(tapAir(first, before.min)));
          if ("style" in build) {
            e.shape.execute({ playerId, style: build.style });
          } else {
            e.session.setFlow(
              setHeight(
                chooseHeightedFlow(e.session.flow, build.kind),
                chosenHeight,
              ),
            );
            e.heighted.execute({ playerId, fill: build.fill });
          }
          e.drain();
          const written = [...cellsOf(region)].filter(
            (cell) => e.world.stateAt(overworld, cell)?.typeId === stone.typeId,
          );
          expect(written.length).toBeGreaterThan(0);
          const built = written
            .map((cell) => boxOf(cell, cell))
            .reduce(unionOf);
          const result = selectionOf(overworld, built, stone);
          expect(e.session.flow).toMatchObject({
            kind: "selected",
            menuLevel: "root",
            selection: result,
          });
          expect(e.session.confirmedBox).toEqual(result);
          const entry = e.session.takeUndo();
          expect(entry).toMatchObject({
            kind: "cells",
            record: { selectionBefore: before, selectionAfter: built },
          });
          if (typeof entry === "string") throw new Error(entry);
          e.session.putBackUndo(entry);

          expect(e.pressUndo.execute({ playerId })).toBe("undone");
          e.drain();
          const restored = selectionOf(overworld, before, stone);
          expect(e.session.flow).toMatchObject({
            kind: "selected",
            menuLevel: "root",
            ...tappedSelection(restored, before.max, before.min),
          });
          expect(e.session.confirmedBox).toEqual(restored);
          expect(snapshot(e, region)).toEqual(blocks);
          expect(e.feedback.messages.at(-1)?.message).toBe("undoDone");
          expect(e.session.hasHistory).toBe(false);
          e.undo.execute({ playerId });
          expect(e.feedback.messages.at(-1)?.message).toBe("nothingToUndo");
        },
      ),
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
      e.session.setFlow(setHeight(chooseHeightedFlow(e.session.flow, kind), 3));
      e.heighted.execute({ playerId, fill: "fill" });
    }
    e.drain();

    const other = boxOf({ x: 10, y: 64, z: 10 }, { x: 13, y: 64, z: 14 });
    const selection = selectionOf(overworld, other, stone);
    e.session.confirmBox(selection, "selected", cornerTaps(selection.box));
    const flow = e.session.flow;

    e.undo.execute({ playerId });
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
    const floor = { x: 0, y: OVERWORLD_RANGE.maxY - 2, z: 0 };
    const above = { ...floor, y: floor.y + 1 };
    const box = boxOf(floor, above);
    e.world.put(floor, stone);
    e.world.put(above, stone);
    const history = e.session.hasHistory;
    if (operation === "Remove above") {
      e.session.setFlow({
        kind: "terrainConfirm",
        op: "removeAbove",
        ...tappedSelection(
          selectionOf(overworld, boxOf(floor, floor), stone),
          floor,
          floor,
        ),
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

it("Undo while editing height again restores the pre-turn taps and height aim", () => {
  fc.assert(
    fc.property(
      size,
      size,
      fc.integer({ min: 1, max: 8 }),
      (width, depth, height) => {
        const e = setup();
        const from = { x: width, y: 65, z: 0 };
        const to = { x: 0, y: 63, z: depth };
        const before = boxOf(from, to);
        e.session.setFlow(
          tapAir(tapBlock(e.session.flow, overworld, from, stone), to),
        );
        expect(e.rotate.execute({ playerId, dimensionId: overworld })).toBe(
          "rotated",
        );
        e.session.setFlow(
          setHeight(adjustHeight(e.session.flow, OVERWORLD_RANGE), height),
        );
        expect(e.pressUndo.execute({ playerId })).toBe("undone");
        const restored = e.session.flow;
        expect(restored).toMatchObject({
          kind: "baseHeight",
          baseBox: boxWithHeight(before, 1),
          liveHeight: height,
          selection: { box: before },
          taps: { from, to },
        });
        if (restored.kind !== "baseHeight")
          throw new Error("Expected height aim");
        expect(confirmLiveHeight(restored).selection.box).toEqual(
          boxWithHeight(before, height),
        );
      },
    ),
  );
});

it("Undo of a narrow sphere restores taps spanning the original footprint", () => {
  fc.assert(
    fc.property(fc.integer({ min: 12, max: 24 }), (width) => {
      const e = setup();
      const from = { x: width, y: 61, z: 0 };
      const to = { x: 0, y: 60, z: 1 };
      const first = tapBlock(e.session.flow, overworld, from, stone);
      const selected = confirmEndpointHeight(tapAir(first, to));
      e.session.setFlow(chooseHeightedFlow(selected, "sphere"));
      e.heighted.execute({ playerId, fill: "fill" });
      e.drain();
      expect(e.pressUndo.execute({ playerId })).toBe("undone");
      e.drain();
      expect(e.session.flow).toMatchObject({
        kind: "selected",
        selection: { box: boxOf(from, to) },
        taps: { from, to },
      });
    }),
  );
});

function expectTapFootprint(flow: BuildFlow) {
  let box: CellBox;
  let taps: Taps;
  switch (flow.kind) {
    case "selected":
    case "terrainConfirm":
    case "baseHeight":
      box = flow.selection.box;
      taps = flow.taps;
      break;
    case "heightStep":
      box = flow.base;
      taps = flow.taps;
      break;
    case "stairAim":
    case "stairContents":
      box = flow.selectionBefore;
      taps = flow.taps;
      break;
    default:
      return;
  }
  const span = boxOf(taps.from, taps.to);
  expect(span).toMatchObject({
    min: { x: box.min.x, z: box.min.z },
    max: { x: box.max.x, z: box.max.z },
  });
}

it("keeps taps spanning the selection through height, rotation, Undo and the build and terrain menus", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 3, max: 16 }),
      fc.boolean(),
      fc.array(
        fc.constantFrom(
          "rotate",
          "editHeight",
          "undo",
          "gable",
          "sphere",
          "fill",
        ),
        { minLength: 1, maxLength: 12 },
      ),
      (width, reverse, actions) => {
        const e = setup();
        const cmd = { playerId, dimensionId: overworld };
        const tap = new SetPoint(e.repo, e.world, e.feedback);
        const confirm = new ConfirmLiveHeight(e.repo);
        const adjust = new ChooseAdjustHeight(e.repo, e.feedback, e.world);
        const menu = new OpenBuildMenu(e.repo, { refresh: () => {} });
        const choose = new ChooseHeighted(e.repo, e.feedback, e.world);
        const cancel = new BackToAiming(e.repo);
        const check = () => expectTapFootprint(e.session.flow);
        const a = { x: -2, y: 65, z: 3 };
        const b = { x: a.x + width, y: 64, z: 4 };
        const [from, to] = reverse ? [b, a] : [a, b];
        e.world.put(from, stone);
        tap.execute({ ...cmd, cell: from });
        tap.execute({ ...cmd, cell: to });
        check();
        expect(confirm.execute(cmd)).toBe(true);
        check();
        for (const action of actions) {
          switch (action) {
            case "rotate":
              expect(e.rotate.execute(cmd)).toBe("rotated");
              break;
            case "editHeight":
              adjust.execute(cmd);
              check();
              confirm.execute(cmd);
              break;
            case "undo":
              e.pressUndo.execute(cmd);
              break;
            default:
              menu.execute(cmd);
              check();
              if (action === "fill") e.shape.execute({ ...cmd, style: "fill" });
              else {
                choose.execute({ ...cmd, kind: action });
                check();
                e.heighted.execute({ ...cmd, fill: "fill" });
              }
          }
          e.drain();
          check();
        }
        expect(e.rotate.execute(cmd)).toBe("rotated");
        check();
        new ChooseTerrain(e.repo, e.feedback, e.world).execute({
          ...cmd,
          op: "removeAbove",
        });
        const terrain = e.session.flow;
        if (terrain.kind !== "terrainConfirm")
          throw new Error("Expected terrain menu");
        check();
        cancel.backToAiming(cmd);
        expect(e.session.flow).toMatchObject({
          kind: "point1",
          start: { cell: terrain.taps.from },
        });
        tap.execute({
          ...cmd,
          cell: { ...terrain.taps.from, x: terrain.taps.from.x + 3 },
        });
        check();
        expect(e.rotate.execute(cmd)).toBe("rotated");
        new ChooseStairs(e.repo, e.feedback).execute({ ...cmd, op: "stairs" });
        check();
        const aim = e.session.flow;
        if (aim.kind !== "stairAim") throw new Error("Expected stair aim");
        const goal = { ...aim.row.min, x: aim.row.min.x + 4, y: aim.row.y + 1 };
        const gaze = new FakeAimReader();
        gaze.target = {
          input: "pointer",
          ray: { origin: goal, direction: { x: 0, y: -1, z: 0 } },
          block: { cell: goal, face: "up" },
        };
        const fix = new FixStairGoal(e.repo, e.feedback, gaze);
        expect(fix.execute(cmd)).toBe(true);
        check();
        cancel.backToAiming(cmd);
        expect(e.session.flow).toMatchObject({
          kind: "point1",
          start: { cell: aim.row.min },
        });
      },
    ),
  );
});
