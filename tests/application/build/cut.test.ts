import fc from "fast-check";
import { expect, it } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { ConfirmBoxStep } from "../../../src/application/build/confirmBoxStep";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { EditJobs } from "../../../src/application/build/editJobs";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  setHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { shapeOf } from "../../../src/domain/build/shape/shape";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { clipboardCells, holdClipboard } from "../../support/buildClipboard";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";

const playerId = asPlayerId("alex");
const stone = blockStateOf("minecraft:stone", { stone_type: "granite" });
const origin = { x: 0, y: 64, z: 0 };
function setup() {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  const world = new FakeWorld();
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    { warn: () => {} },
    new FakeBuildPlayers(),
  );
  const session = repo.getOrCreate(playerId);
  const cut = new CutBox(repo, world, feedback, jobs);
  const actions = { copy: new CopyBox(repo, world, feedback), cut };
  const drain = () => {
    while (session.isEditing) jobs.step();
  };
  return {
    repo,
    feedback,
    world,
    session,
    cut,
    drain,
    choose: new ChooseBoxStep(repo, actions, feedback),
    confirm: new ConfirmBoxStep(repo, actions, feedback),
    undo: new UndoEdit(repo, feedback, jobs),
  };
}

it("copies every selected cell to the clipboard, empties the box including fluids, and Undo restores the before states", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 6 }),
      (x, y, z) => {
        const e = setup();
        const box = boxOf(origin, { x: x - 1, y: 63 + y, z: z - 1 });
        const cells = [...cellsOf(box)];
        const states = [
          stone,
          blockStateOf("minecraft:water", { liquid_depth: 3 }),
          blockStateOf("minecraft:lava"),
          AIR,
        ];
        cells.forEach((cell, i) => {
          e.world.put(cell, states[i % states.length] ?? AIR);
        });
        const before = cells.map((cell) => e.world.stateAt(overworld, cell));
        const outside = { ...box.max, x: box.max.x + 1 };
        e.world.put(outside, stone);
        const expected = clipboardOf(box, (cell) =>
          e.world.stateAt(overworld, cell),
        );
        holdClipboard(
          e.session,
          clipboardOf(boxOf(origin, origin), () => stone),
        );
        expect(e.cut.execute(playerId, overworld, box)).toBe(true);
        expect(e.feedback.messages.at(-1)?.message).toBe("cutting");
        expect(e.session.flow.kind).toBe("pasteAim");
        expect(e.session.clipboard).toEqual(expected);
        expect(e.session.confirmedBox).toEqual({ dimensionId: overworld, box });
        e.drain();
        expect(cells.map((cell) => e.world.stateAt(overworld, cell))).toEqual(
          cells.map(() => AIR),
        );
        expect(e.world.stateAt(overworld, outside)).toEqual(stone);
        expect(e.world.writes).toBe(
          before.filter((state) => state !== AIR).length,
        );
        expect(e.session.hasHistory).toBe(true);
        expect(e.session.clipboard).toEqual(expected);
        e.undo.execute({ playerId });
        e.drain();
        expect(cells.map((cell) => e.world.stateAt(overworld, cell))).toEqual(
          before,
        );
        expect(e.session.hasHistory).toBe(false);
        expect(e.session.clipboard).toEqual(expected);
        expect(e.session.flow.kind).toBe("pasteAim");
      },
    ),
  );
});

it.each(["direct", "height"] as const)(
  "refuses oversized and busy %s cuts without changing selection or the old clipboard",
  (path) => {
    for (const refusal of ["tooLarge", "busy"] as const) {
      const e = setup();
      const end = { x: 1, y: 64, z: 1 };
      const endpoint = tapAir(
        tapBlock({ kind: "idle" }, overworld, origin, stone),
        end,
      );
      const box = boxOf(origin, origin);
      const clipboard = clipboardOf(box, () => stone);
      e.session.completeCopy(overworld, box, clipboard);
      const flow =
        path === "height"
          ? setHeight(
              chooseHeighted(endpoint, "cut"),
              refusal === "tooLarge" ? BUILD_SPEC.maxCopyVolume : 1,
            )
          : tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), {
              ...origin,
              x: refusal === "tooLarge" ? BUILD_SPEC.maxCopyVolume : 1,
            });
      e.session.setFlow(flow);
      const confirmed = e.session.confirmedBox;
      if (refusal === "busy") e.session.beginEdit();
      if (path === "height") e.confirm.execute({ playerId });
      else e.choose.execute({ playerId, kind: "cut" });
      expect(e.feedback.messages.at(-1)?.message).toBe(refusal);
      expect(e.session.flow).toBe(flow);
      expect(e.session.confirmedBox).toBe(confirmed);
      expect(e.session.clipboard).toBe(clipboard);
      expect(e.world.writes).toBe(0);
    }
  },
);

it("skips kept and protected cells and records only changes", () => {
  const e = setup();
  const box = boxOf(origin, { ...origin, x: 3 });
  const cells = [...cellsOf(box)];
  const sign = blockStateOf("minecraft:standing_sign");
  cells.forEach((cell) => {
    e.world.put(cell, stone);
  });
  e.world.put(origin, sign);
  e.world.protectedCells.add(cellKey({ ...origin, x: 1 }));
  e.world.put({ ...origin, x: 2 }, AIR);
  e.cut.execute(playerId, overworld, box);
  e.drain();
  expect(cells.map((cell) => e.world.stateAt(overworld, cell))).toEqual([
    sign,
    stone,
    AIR,
    AIR,
  ]);
  expect(e.world.writes).toBe(1);
  const record = e.session.takeUndo();
  expect(record).toEqual({
    dimensionId: overworld,
    changes: [{ cell: { ...origin, x: 3 }, before: stone, after: AIR }],
  });
});

it("shares the upward height step and cuts immediately on confirmation", () => {
  const e = setup();
  const end = { x: 1, y: 64, z: 1 };
  e.session.setFlow(
    tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), end),
  );
  e.world.put({ ...origin, y: 66 }, stone);
  e.choose.execute({ playerId, kind: "cut" });
  expect(e.session.flow).toMatchObject({
    kind: "heightStep",
    heightedKind: "cut",
    previous: 1,
  });
  expect(e.session.isEditing).toBe(false);
  e.session.setFlow(setHeight(e.session.flow, 3));
  e.confirm.execute({ playerId });
  e.drain();
  expect(e.world.stateAt(overworld, { ...origin, y: 66 })).toEqual(AIR);
  expect(e.session.confirmedBox?.box.max.y).toBe(66);
});

it("cuts all other shapes directly and reserves height selection for horizontal rectangles", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -4, max: 4 }),
        y: fc.integer({ min: -4, max: 4 }),
        z: fc.integer({ min: -4, max: 4 }),
      }),
      (delta) => {
        const e = setup();
        const end = {
          x: origin.x + delta.x,
          y: origin.y + delta.y,
          z: origin.z + delta.z,
        };
        const box = boxOf(origin, end);
        e.world.put(origin, stone);
        e.session.setFlow(
          tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), end),
        );
        e.choose.execute({ playerId, kind: "cut" });
        const shape = shapeOf(origin, end);
        if (shape.kind === "rect" && shape.flat === "y") {
          expect(e.session.flow).toMatchObject({
            kind: "heightStep",
            heightedKind: "cut",
          });
          expect(e.session.isEditing).toBe(false);
        } else {
          expect(e.session.flow.kind).toBe("pasteAim");
          expect(e.session.isEditing).toBe(true);
          e.drain();
          expect(e.world.stateAt(overworld, origin)).toEqual(AIR);
          expect(e.session.confirmedBox).toEqual({
            dimensionId: overworld,
            box,
          });
        }
        if (!(shape.kind === "rect" && shape.flat === "y"))
          expect(clipboardCells(e.session.clipboard).length).toBeGreaterThan(0);
      },
    ),
  );
});

it("keeps protected cells but still stores them in the clipboard", () => {
  const e = setup();
  const box = boxOf(origin, { ...origin, x: 1 });
  e.world.put(origin, stone);
  e.world.put({ ...origin, x: 1 }, stone);
  e.world.protectedCells.add(cellKey({ ...origin, x: 1 }));
  e.cut.execute(playerId, overworld, box);
  e.drain();
  expect(e.world.stateAt(overworld, { ...origin, x: 1 })).toEqual(stone);
  expect(clipboardCells(e.session.clipboard)).toHaveLength(2);
});

it("refuses a box above the copy limit even though the edit limit is larger", () => {
  const e = setup();
  expect(BUILD_SPEC.maxVolume).toBeGreaterThan(BUILD_SPEC.maxCopyVolume);
  const box = boxOf(origin, { ...origin, x: BUILD_SPEC.maxCopyVolume });
  expect(e.cut.execute(playerId, overworld, box)).toBe(false);
  expect(e.feedback.messages.at(-1)?.message).toBe("tooLarge");
  expect(e.session.clipboard).toBeUndefined();
});

it("leaves no history for a cut of only air", () => {
  const e = setup();
  const box = boxOf(origin, { ...origin, x: 9 });
  expect(e.cut.execute(playerId, overworld, box)).toBe(true);
  e.drain();
  expect(e.world.writes).toBe(0);
  expect(e.session.hasHistory).toBe(false);
});
