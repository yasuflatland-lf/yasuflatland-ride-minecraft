import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { AimRoofHeight } from "../../../src/application/build/aimRoofHeight";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ChooseRoof } from "../../../src/application/build/chooseRoof";
import { ConfirmRoof } from "../../../src/application/build/confirmRoof";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { SetPoint } from "../../../src/application/build/setPoint";
import { StartPaste } from "../../../src/application/build/startPaste";
import { TapAir } from "../../../src/application/build/tapAir";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import {
  anchorCell,
  clipboardOf,
  type Face,
  pasteBox,
} from "../../../src/domain/build/clipboard/clipboard";
import {
  setRoofHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import {
  maxRoofHeight,
  roofCells,
  roofCount,
} from "../../../src/domain/build/roof/roof";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  cellKey,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const dirt = blockStateOf("minecraft:dirt");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const face = fc.constantFrom<Face>(
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
);
const roofKind = fc.constantFrom("gable" as const, "hip" as const);
function setup() {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const jobs = new EditJobs(repo, world, feedback);
  return { repo, session, world, feedback, jobs };
}
function roof(
  e: ReturnType<typeof setup>,
  base: ReturnType<typeof boxOf>,
  kind: "gable" | "hip",
) {
  e.session.setFlow(
    tapAir(tapBlock({ kind: "idle" }, overworld, base.min, stone), base.max),
  );
  new ChooseRoof(e.repo).execute({ playerId, kind });
}

it("aims through cell centers and clamps roof layers to the side and world caps", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 2, max: 20 }),
      fc.integer({ min: 2, max: 20 }),
      roofKind,
      fc.integer({ min: -1000, max: 1000 }),
      (min, sx, sz, kind, aimY) => {
        const e = setup();
        const base = boxOf(min, {
          x: min.x + sx - 1,
          y: min.y,
          z: min.z + sz - 1,
        });
        roof(e, base, kind);
        const aim = new AimRoofHeight(e.repo);
        aim.execute({
          playerId,
          ray: {
            origin: { x: base.min.x - 10, y: aimY, z: base.min.z + sz / 2 },
            direction: { x: 0.8, y: 0.6, z: 0 },
          },
        });
        const cap = maxRoofHeight(base, BUILD_SPEC.worldTopY);
        const expected = Math.max(
          1,
          Math.min(cap, Math.round(aimY + ((10 + sx / 2) * 0.6) / 0.8 - min.y)),
        );
        expect(e.session.flow).toMatchObject({
          kind: "roofHeight",
          previous: expected,
        });
        aim.execute({
          playerId,
          ray: { origin: min, direction: { x: 0, y: 1, z: 0 } },
        });
        expect(e.session.flow).toMatchObject({ previous: expected });
        const before = e.session.flow;
        new SetPoint(e.repo, e.world, e.feedback).execute({
          playerId,
          dimensionId: nether,
          cell: min,
        });
        new TapAir(e.repo, e.feedback).execute({ playerId, end: min });
        expect(e.session.flow).toBe(before);
      },
    ),
  );
  const e = setup();
  roof(e, boxOf({ x: 0, y: 318, z: 0 }, { x: 3, y: 318, z: 3 }), "hip");
  new AimRoofHeight(e.repo).execute({
    playerId,
    ray: { origin: { x: 0, y: 999, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
  });
  expect(e.session.flow).toMatchObject({ previous: 2 });
});

it("confirms roof cells and retains their bounding box for copying", () => {
  fc.assert(
    fc.property(
      roofKind,
      fc.boolean(),
      fc.integer({ min: 1, max: 8 }),
      (kind, hollow, height) => {
        const e = setup();
        const base = boxOf({ x: 2, y: 64, z: 3 }, { x: 8, y: 64, z: 9 });
        roof(e, base, kind);
        e.session.setFlow(setRoofHeight(e.session.flow, height));
        const spec = { base, kind, height };
        new ConfirmRoof(e.repo, e.feedback, e.jobs).execute({
          playerId,
          hollow,
        });
        expect(e.session.flow).toEqual({ kind: "idle" });
        expect(e.session.confirmedBox).toEqual({
          dimensionId: overworld,
          box: { min: base.min, max: { ...base.max, y: 64 + height - 1 } },
        });
        e.jobs.step();
        expect(e.world.writes).toBe(roofCount(spec, hollow));
        for (const at of roofCells(spec, hollow))
          expect(e.world.stateAt(overworld, at)).toEqual(stone);
      },
    ),
  );
});

it("refuses oversized and busy roofs without consuming the height stage", () => {
  const e = setup();
  const base = boxOf({ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 1000 });
  roof(e, base, "gable");
  const flow = e.session.flow;
  const confirm = new ConfirmRoof(e.repo, e.feedback, e.jobs);
  confirm.execute({ playerId, hollow: false });
  expect(e.feedback.messages.at(-1)).toEqual({
    message: "tooLarge",
    count: 1001 ** 2,
  });
  expect(e.session.flow).toBe(flow);
  expect(e.session.isEditing).toBe(false);
  roof(e, boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }), "hip");
  const small = e.session.flow;
  e.session.beginEdit();
  confirm.execute({ playerId, hollow: true });
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.flow).toBe(small);
  expect(e.world.writes).toBe(0);
});

it("pastes clipboard-relative cells at the hit face with either air policy", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      face,
      fc.boolean(),
      fc.integer({ min: 1, max: 4 }),
      fc.array(fc.boolean(), { minLength: 64, maxLength: 64 }),
      (source, block, face, skipAir, size, solids) => {
        const e = setup();
        const sourceBox = boxOf(source, {
          x: source.x + size - 1,
          y: source.y + size - 1,
          z: source.z + size - 1,
        });
        let i = 0;
        const clip = clipboardOf(sourceBox, () => (solids[i++] ? stone : AIR));
        e.session.setClipboard(clip);
        new StartPaste(e.repo).execute({ playerId, skipAir });
        const anchor = anchorCell(block, face);
        const delta = {
          up: [0, 1, 0],
          down: [0, -1, 0],
          north: [0, 0, -1],
          south: [0, 0, 1],
          east: [1, 0, 0],
          west: [-1, 0, 0],
        }[face];
        expect(anchor).toEqual({
          x: block.x + (delta[0] as number),
          y: block.y + (delta[1] as number),
          z: block.z + (delta[2] as number),
        });
        expect(pasteBox(clip, anchor).min).toEqual(anchor);
        for (const at of cellsOf(pasteBox(clip, anchor))) e.world.put(at, dirt);
        const read = vi.spyOn(e.world, "mayEdit");
        new PasteAt(e.repo, e.world, e.feedback, e.jobs).execute({
          playerId,
          dimensionId: nether,
          block,
          face,
        });
        expect(read.mock.calls).toEqual(
          [...cellsOf(pasteBox(clip, anchor))].map((at) => [nether, at]),
        );
        expect(e.session.flow).toEqual({ kind: "idle" });
        e.jobs.step();
        for (const { at, state } of clip.cells)
          expect(
            e.world.stateAt(nether, {
              x: anchor.x + at.x,
              y: anchor.y + at.y,
              z: anchor.z + at.z,
            }),
          ).toEqual(skipAir && state === AIR ? dirt : state);
      },
    ),
  );
});

it("preserves paste aiming on missing clipboard, busy jobs and protected holes", () => {
  const e = setup();
  const start = new StartPaste(e.repo);
  const paste = new PasteAt(e.repo, e.world, e.feedback, e.jobs);
  const cmd = {
    playerId,
    dimensionId: overworld,
    block: { x: 0, y: 0, z: 0 },
    face: "up" as const,
  };
  paste.execute(cmd);
  expect(e.feedback.messages).toEqual([]);
  start.execute({ playerId, skipAir: true });
  const flow = e.session.flow;
  paste.execute(cmd);
  expect(e.feedback.messages.at(-1)?.message).toBe("noClipboard");
  expect(e.session.flow).toBe(flow);
  e.session.setClipboard(
    clipboardOf(
      boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
      () => undefined,
    ),
  );
  e.world.protectedCells.add(cellKey({ x: 1, y: 1, z: 0 }));
  paste.execute(cmd);
  expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
  expect(e.session.flow).toBe(flow);
  e.world.protectedCells.clear();
  e.session.beginEdit();
  paste.execute(cmd);
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.flow).toBe(flow);
  expect(e.world.writes).toBe(0);
  new CancelFlow(e.repo).execute({ playerId });
  expect(e.session.flow).toEqual({ kind: "idle" });
});
