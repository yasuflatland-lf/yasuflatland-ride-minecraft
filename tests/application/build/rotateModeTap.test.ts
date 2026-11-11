import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateModeTap } from "../../../src/application/build/rotateModeTap";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, type CellBox, cellsOf } from "../../../src/domain/build/box";
import type { BuildFlow } from "../../../src/domain/build/flow/flow";
import { beginRotateMode } from "../../../src/domain/build/flow/rotateMode";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
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
const box = boxOf({ x: 0, y: 64, z: 0 }, { x: 4, y: 65, z: 1 });
const cmd = { playerId, dimensionId: overworld };
function setup(source: CellBox = box) {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const structures = new FakeStructureStore(world);
  const feedback = new FakeFeedback();
  const players = new FakeBuildPlayers();
  const log = { warn: vi.fn() };
  const session = repo.getOrCreate(playerId);
  session.setFlow(beginRotateMode(overworld, source, stone, 1));
  const rotate = new RotateBox(repo, world, players, structures, feedback, log);
  const jobs = new EditJobs(repo, world, feedback, log, players, structures);
  return {
    repo,
    world,
    structures,
    session,
    tap: new RotateModeTap(repo, rotate),
    undo: new UndoEdit(repo, feedback, jobs, world, structures, log),
  };
}

it("ignores absent sessions, every other flow, and rotation in another dimension", () => {
  const repo = new FakeSessions();
  const rotate = { execute: vi.fn(() => "rotated" as const) };
  const tap = new RotateModeTap(repo, rotate);
  expect(tap.execute(cmd)).toBe("ignored");
  expect(repo.get(playerId)).toBeUndefined();
  const flows: BuildFlow[] = [
    { kind: "idle" },
    { kind: "point1", dimensionId: overworld, cell: box.min, material: stone },
    {
      kind: "endpoint",
      dimensionId: overworld,
      from: box.min,
      to: box.max,
      material: stone,
    },
    {
      kind: "heightStep",
      dimensionId: overworld,
      base: box,
      from: box.min,
      heightedKind: "rotate",
      previous: 2,
      heightLocked: false,
      material: stone,
    },
    {
      kind: "terrainConfirm",
      dimensionId: overworld,
      from: box.min,
      to: box.max,
      material: stone,
      op: "fillBelow",
    },
    { kind: "pasteAim", turn: 0 },
    beginRotateMode(nether, box, stone, 1),
  ];
  for (const flow of flows) {
    repo.getOrCreate(playerId).setFlow(flow);
    expect(tap.execute(cmd)).toBe("ignored");
    expect(repo.get(playerId)?.flow).toBe(flow);
  }
  expect(rotate.execute).not.toHaveBeenCalled();
});

it.each(["rotated", "refused", "busy", "ignored"] as const)(
  "returns the rotation result unchanged: %s",
  (result) => {
    const e = setup();
    const rotate = { execute: vi.fn(() => result) };
    expect(new RotateModeTap(e.repo, rotate).execute(cmd)).toBe(result);
    expect(rotate.execute).toHaveBeenCalledExactlyOnceWith(cmd);
  },
);

it("three taps accumulate from turn one to zero and record three snapshots", () => {
  fc.assert(
    fc.property(fc.integer({ min: -30, max: 30 }), (x) => {
      const initial = boxOf({ ...box.min, x }, { ...box.max, x: x + 4 });
      const e = setup(initial);
      let target = initial;
      for (let step = 1; step <= 3; step++) {
        target = planRotationAboutCenter(target).target;
        expect(e.tap.execute(cmd)).toBe("rotated");
        expect(e.session.flow).toEqual(
          beginRotateMode(
            overworld,
            target,
            stone,
            ((1 + step) % 4) as 0 | 1 | 2 | 3,
          ),
        );
      }
      for (let n = 0; n < 3; n++)
        expect(e.session.takeUndo()).toMatchObject({ kind: "snapshot" });
      expect(e.session.takeUndo()).toBe("nothingToUndo");
    }),
  );
});

it.each(["protection", "limit", "busy", "place", "clear", "capture"] as const)(
  "preserves box, turn and earlier history after %s refusal",
  (failure) => {
    const e = setup(
      failure === "limit" ? boxOf(box.min, { x: 63, y: 79, z: 0 }) : box,
    );
    e.session.finishEdit(
      {
        dimensionId: overworld,
        changes: [
          {
            cell: box.min,
            before: stone,
            after: blockStateOf("minecraft:dirt"),
          },
        ],
      },
      "undoable",
    );
    if (failure === "protection") e.world.protectedCells.add(cellKey(box.min));
    if (failure === "busy") e.session.beginEdit();
    if (failure === "place") e.structures.placeSucceeds = false;
    if (failure === "clear") e.structures.clearBlocksSucceeds = false;
    if (failure === "capture") e.structures.captureRefusal = "unreadable";
    const before = structuredClone(e.session);
    expect(e.tap.execute(cmd)).toBe(failure === "busy" ? "busy" : "refused");
    expect(e.session).toEqual(before);
  },
);

it("evicts and discards the oldest snapshot on the eleventh tap", () => {
  const e = setup();
  expect(e.tap.execute(cmd)).toBe("rotated");
  const oldest = [...e.structures.live][0];
  for (let n = 1; n < 11; n++) expect(e.tap.execute(cmd)).toBe("rotated");
  expect(e.structures.live.size).toBe(10);
  expect(e.structures.calls).toContainEqual({
    kind: "discard",
    handle: oldest,
  });
  for (let n = 0; n < 10; n++)
    expect(e.session.takeUndo()).toMatchObject({ kind: "snapshot" });
  expect(e.session.takeUndo()).toBe("nothingToUndo");
});

it("undo restores one tap at a time including overwritten neighbors", () => {
  const e = setup();
  const union = planRotationAboutCenter(box).union;
  const cells = [...cellsOf(union)];
  cells.forEach((cell, index) => {
    e.world.put(cell, blockStateOf("minecraft:stone", { fixture: index }));
  });
  const before = [];
  for (let n = 0; n < 3; n++) {
    before.push(cells.map((cell) => e.world.stateAt(overworld, cell)));
    expect(e.tap.execute(cmd)).toBe("rotated");
  }
  for (const states of before.reverse()) {
    e.undo.execute({ playerId });
    expect(cells.map((cell) => e.world.stateAt(overworld, cell))).toEqual(
      states,
    );
  }
  expect(e.session.hasHistory).toBe(false);
  expect(e.structures.live.size).toBe(0);
});
