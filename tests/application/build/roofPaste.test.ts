import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { AimHeight } from "../../../src/application/build/aimHeight";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { ConfirmHeighted } from "../../../src/application/build/confirmHeighted";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { SetPoint } from "../../../src/application/build/setPoint";
import { TapAir } from "../../../src/application/build/tapAir";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import {
  type Face,
  pasteTarget,
} from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  setHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import {
  maxRoofHeight,
  roofCells,
  roofCount,
} from "../../../src/domain/build/roof/roof";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { placementOf } from "../../../src/domain/build/volume/geometry";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
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
const heightedKind = fc.constantFrom("gable" as const, "hip" as const);
function setup() {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    { warn: () => {} },
    new FakeBuildPlayers(),
  );
  const structures = new FakeStructureStore(world);
  return { repo, session, world, feedback, jobs, structures };
}
function roof(
  e: ReturnType<typeof setup>,
  base: ReturnType<typeof boxOf>,
  kind: "gable" | "hip",
) {
  e.session.setFlow(
    tapAir(tapBlock({ kind: "idle" }, overworld, base.min, stone), base.max),
  );
  new ChooseHeighted(e.repo, e.feedback).execute({ playerId, kind });
}

it("aims through cell centers and clamps roof layers to the side and world caps", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 2, max: 20 }),
      fc.integer({ min: 2, max: 20 }),
      heightedKind,
      fc.integer({ min: -1000, max: 1000 }),
      (min, sx, sz, kind, aimY) => {
        const e = setup();
        const base = boxOf(min, {
          x: min.x + sx - 1,
          y: min.y,
          z: min.z + sz - 1,
        });
        roof(e, base, kind);
        const aim = new AimHeight(e.repo);
        // The rise to the center line is a multiple of 0.375, so a 0.2 offset
        // keeps the aimed point at least 0.075 off a layer boundary, where
        // floating-point error could flip the floored layer.
        const originY = aimY + 0.2;
        aim.execute({
          playerId,
          ray: {
            origin: { x: base.min.x - 10, y: originY, z: base.min.z + sz / 2 },
            direction: { x: 0.8, y: 0.6, z: 0 },
          },
        });
        const cap = maxRoofHeight(base, BUILD_SPEC.worldTopY);
        const expected = Math.max(
          1,
          Math.min(
            cap,
            Math.floor(originY + ((10 + sx / 2) * 0.6) / 0.8 - min.y) + 1,
          ),
        );
        expect(e.session.flow).toMatchObject({
          kind: "heightStep",
          heightLocked: false,
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
  new AimHeight(e.repo).execute({
    playerId,
    ray: { origin: { x: 0, y: 999, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
  });
  expect(e.session.flow).toMatchObject({ previous: 2 });
});

it("confirms roof cells and retains their bounding box for copying", () => {
  fc.assert(
    fc.property(
      heightedKind,
      fc.boolean(),
      fc.integer({ min: 1, max: 8 }),
      (kind, hollow, height) => {
        const e = setup();
        const base = boxOf({ x: 2, y: 64, z: 3 }, { x: 8, y: 64, z: 9 });
        roof(e, base, kind);
        e.session.setFlow(setHeight(e.session.flow, height));
        const spec = { base, kind, height };
        new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
          playerId,
          fill: hollow ? "hollow" : "fill",
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
  const confirm = new ConfirmHeighted(e.repo, e.feedback, e.jobs);
  confirm.execute({ playerId, fill: "fill" });
  expect(e.feedback.messages.at(-1)).toEqual({
    message: "tooLarge",
    count: 1001 ** 2,
  });
  expect(e.session.flow).toBe(flow);
  expect(e.session.isEditing).toBe(false);
  roof(e, boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }), "hip");
  const small = e.session.flow;
  e.session.beginEdit();
  confirm.execute({ playerId, fill: "hollow" });
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.flow).toBe(small);
  expect(e.world.writes).toBe(0);
});

it("pastes clipboard-relative cells at the hit face including air", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      face,
      fc.integer({ min: 1, max: 4 }),
      fc.array(fc.boolean(), { minLength: 64, maxLength: 64 }),
      (source, block, face, size, solids) => {
        const e = setup();
        const sourceBox = boxOf(source, {
          x: source.x + size - 1,
          y: source.y + size - 1,
          z: source.z + size - 1,
        });
        let i = 0;
        const expected = [...cellsOf(sourceBox)].map(() =>
          solids[i++] ? stone : AIR,
        );
        i = 0;
        const clip = structureClipboard(
          sourceBox,
          () => expected[i++],
          e.structures,
        );
        holdClipboard(e.session, clip);
        e.session.setFlow(beginPasteAim());
        const { anchor, box } = pasteTarget(clip, block, face);
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
        expect(box.min).toEqual(anchor);
        for (const at of cellsOf(box)) e.world.put(at, dirt);
        const read = vi.spyOn(e.world, "mayEdit");
        new PasteAt(
          e.repo,
          e.world,
          e.feedback,
          e.structures,
          new FakeBuildPlayers(),
        ).execute({
          tick: 0,
          playerId,
          dimensionId: nether,
          target: pasteTarget(clip, block, face),
        });
        expect(read.mock.calls).toEqual(
          [...cellsOf(box)].map((at) => [nether, at]),
        );
        expect(e.session.flow).toEqual({
          kind: "pasteAim",
          turn: 0,
          lastPaste: { anchor, tick: 0 },
        });
        e.jobs.step();
        for (const [index, at] of [...cellsOf(box)].entries())
          expect(e.world.stateAt(nether, at)).toEqual(expected[index]);
      },
    ),
  );
});

it("preserves paste aiming on missing clipboard, busy jobs and protected holes", () => {
  const e = setup();
  const paste = new PasteAt(
    e.repo,
    e.world,
    e.feedback,
    e.structures,
    new FakeBuildPlayers(),
  );
  const cmd = {
    playerId,
    dimensionId: overworld,
    target: pasteTarget(
      structureClipboard(
        boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
        () => undefined,
      ),
      { x: 0, y: 0, z: 0 },
      "up",
    ),
    tick: 0,
  };
  paste.execute(cmd);
  expect(e.feedback.messages).toEqual([]);
  e.session.setFlow(beginPasteAim());
  const flow = e.session.flow;
  paste.execute(cmd);
  expect(e.feedback.messages.at(-1)?.message).toBe("noClipboard");
  expect(e.session.flow).toBe(flow);
  holdClipboard(
    e.session,
    structureClipboard(
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

it.each(["gable", "hip"] as const)(
  "rejects tube contents on a %s roof without changing the flow",
  (kind) => {
    const e = setup();
    roof(e, boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }), kind);
    const flow = e.session.flow;
    e.feedback.messages = [];
    new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
      playerId,
      fill: "tube",
    });
    expect(e.feedback.messages).toEqual([{ message: "noSelection" }]);
    expect(e.session.flow).toBe(flow);
    expect(e.session.isEditing).toBe(false);
    expect(e.session.confirmedBox).toBeUndefined();
    e.jobs.step();
    expect(e.world.writes).toBe(0);
  },
);

it("confirms solid tubes and rejects oversized solids without consuming the flow", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("cylinder" as const, "cube" as const),
      fc.integer({ min: 1, max: 8 }),
      (kind, height) => {
        const e = setup();
        const base = boxOf({ x: 0, y: 60, z: 0 }, { x: 4, y: 60, z: 5 });
        e.session.setFlow(
          setHeight(
            chooseHeighted(
              tapAir(
                tapBlock({ kind: "idle" }, overworld, base.min, stone),
                base.max,
              ),
              kind,
            ),
            height,
          ),
        );
        const spec = { base, kind, height };
        new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
          playerId,
          fill: "tube",
        });
        expect(e.session.flow).toEqual({ kind: "idle" });
        expect(e.session.confirmedBox).toEqual({
          dimensionId: overworld,
          box: {
            min: base.min,
            max: { ...base.max, y: base.min.y + height - 1 },
          },
        });
        e.jobs.step();
        expect(e.world.writes).toBe(placementOf(kind).count(spec, "tube"));
        for (const at of placementOf(kind).cells(spec, "tube"))
          expect(e.world.stateAt(overworld, at)).toEqual(stone);
        for (const fill of ["fill", "hollow", "tube"] as const) {
          const large = { ...base, max: { x: 100, y: 60, z: 100 } };
          const flow = setHeight(
            chooseHeighted(
              tapAir(
                tapBlock({ kind: "idle" }, overworld, large.min, stone),
                large.max,
              ),
              kind,
            ),
            1000,
          );
          e.session.setFlow(flow);
          const count = placementOf(kind).count(
            { base: large, kind, height: 1000 },
            fill,
          );
          expect(count).toBeGreaterThan(BUILD_SPEC.maxVolume);
          new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
            playerId,
            fill,
          });
          expect(e.feedback.messages.at(-1)).toEqual({
            message: "tooLarge",
            count,
          });
          expect(e.session.flow).toBe(flow);
          expect(e.session.isEditing).toBe(false);
        }
      },
    ),
  );
});
