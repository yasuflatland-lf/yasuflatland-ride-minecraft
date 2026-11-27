import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { ConfirmHeighted } from "../../../src/application/build/confirmHeighted";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { SetPoint } from "../../../src/application/build/setPoint";
import { TapAir } from "../../../src/application/build/tapAir";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, boxWithHeight, cellsOf } from "../../../src/domain/build/box";
import { pasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import {
  setHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/heightFlow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import { cancel } from "../../../src/domain/build/flow/stepBack";
import {
  maxRoofHeight,
  roofCells,
  roofCount,
} from "../../../src/domain/build/roof/roof";
import { turnBetween } from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { placementOf } from "../../../src/domain/build/volume/geometry";
import type { BlockFace } from "../../../src/domain/shared/blockFace";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { NETHER_RANGE, OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  chooseHeightedFlow,
  confirmEndpointHeight,
  tappedSelection,
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

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const dirt = blockStateOf("minecraft:dirt");
const stairs = blockStateOf("minecraft:oak_stairs", {
  weirdo_direction: 3,
  upside_down_bit: true,
});
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const face = fc.constantFrom<BlockFace>(
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
);
const heightedKind = fc.constantFrom("gable" as const, "hip" as const);
function setup() {
  const world = new FakeWorld();
  const structures = new FakeStructureStore(world);
  const repo = new FakeSessions(structures);
  const session = repo.getOrCreate(playerId);
  const feedback = new FakeFeedback();
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    { warn: () => {} },
    new FakeBuildPlayers(),
  );
  return { repo, session, world, feedback, jobs, structures };
}
function roof(
  e: ReturnType<typeof setup>,
  base: ReturnType<typeof boxOf>,
  kind: "gable" | "hip",
  material = stone,
  dimensionId = overworld,
) {
  const range = e.world.heightRange(dimensionId);
  const selected = confirmEndpointHeight(
    tapAir(
      tapBlock({ kind: "idle" }, dimensionId, base.min, material, range),
      base.max,
      range,
    ),
  );
  e.session.setFlowForTest(selected);
  new ChooseHeighted(e.repo, e.feedback, e.world).execute({ playerId, kind });
  return selected;
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
        const base = boxOf(
          cellOf(min),
          cellOf({
            x: min.x + sx - 1,
            y: min.y,
            z: min.z + sz - 1,
          }),
        );
        roof(e, base, kind);
        // The rise to the center line is a multiple of 0.375, so a 0.2 offset
        // keeps the aimed point at least 0.075 off a layer boundary, where
        // floating-point error could flip the floored layer.
        const originY = aimY + 0.2;
        e.session.aimHeight(
          {
            origin: { x: base.min.x - 10, y: originY, z: base.min.z + sz / 2 },
            direction: { x: 0.8, y: 0.6, z: 0 },
          },
          OVERWORLD_RANGE,
        );
        const cap = maxRoofHeight(base, OVERWORLD_RANGE);
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
          liveHeight: expected,
        });
        e.session.aimHeight(
          { origin: min, direction: { x: 0, y: 1, z: 0 } },
          OVERWORLD_RANGE,
        );
        expect(e.session.flow).toMatchObject({ liveHeight: expected });
        const before = e.session.flow;
        new SetPoint(e.repo, e.world, e.feedback).execute({
          playerId,
          dimensionId: nether,
          cell: cellOf(min),
        });
        new TapAir(e.repo, e.feedback, e.world).execute({
          playerId,
          end: cellOf(min),
        });
        expect(e.session.flow).toBe(before);
      },
    ),
  );
  const e = setup();
  roof(
    e,
    boxOf(cellOf({ x: 0, y: 318, z: 0 }), cellOf({ x: 3, y: 318, z: 3 })),
    "hip",
  );
  e.session.aimHeight(
    { origin: { x: 0, y: 999, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    OVERWORLD_RANGE,
  );
  expect(e.session.flow).toMatchObject({ liveHeight: 2 });
});

it("confirms roof cells and retains their bounding box for copying", () => {
  fc.assert(
    fc.property(
      heightedKind,
      fc.boolean(),
      fc.integer({ min: 1, max: 8 }),
      (kind, hollow, height) => {
        const e = setup();
        const base = boxOf(
          cellOf({ x: 2, y: 64, z: 3 }),
          cellOf({ x: 8, y: 64, z: 9 }),
        );
        roof(e, base, kind);
        e.session.setFlowForTest(setHeight(e.session.flow, height));
        const spec = { base, kind, height, style: "stepped" as const };
        new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
          playerId,
          fill: hollow ? "hollow" : "fill",
        });
        expect(e.session.flow).toMatchObject({
          kind: "selected",
          menuLevel: "root",
        });
        expect(e.session.flow).toHaveProperty(
          "selection",
          e.session.confirmedBox,
        );
        expect(e.session.confirmedBox).toEqual({
          material: stone,
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

it.each([1, 5])(
  "builds an outward stair gable with an open bottom and restores the original %s-layer selection",
  (selectedHeight) => {
    const e = setup();
    const base = boxOf(
      cellOf({ x: 0, y: 64, z: 0 }),
      cellOf({ x: 4, y: 64, z: 6 }),
    );
    const original = boxWithHeight(base, selectedHeight);
    roof(e, original, "gable", stairs);
    expect(e.feedback.messages.at(-1)).toMatchObject({
      message: "building",
      material: stairs,
    });
    new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
      playerId,
      fill: "hollow",
    });
    e.jobs.step();
    expect(e.world.writes).toBe(43);
    expect(e.session.confirmedBox?.box).toEqual(boxWithHeight(base, 3));
    const stateAt = (x: number, y: number, z: number) =>
      e.world.stateAt(overworld, cellOf({ x, y, z }));
    expect(stateAt(0, 64, 3)).toEqual(
      blockStateOf(stairs.typeId, {
        weirdo_direction: 0,
        upside_down_bit: false,
      }),
    );
    expect(stateAt(3, 65, 3)).toEqual(
      blockStateOf(stairs.typeId, {
        weirdo_direction: 1,
        upside_down_bit: false,
      }),
    );
    expect(stateAt(2, 66, 3)).toEqual(stairs);
    expect(stateAt(2, 64, 3)).toEqual(AIR);
    const undo = new UndoEdit(
      e.repo,
      e.feedback,
      e.jobs,
      e.world,
      e.structures,
      {
        warn: () => {},
      },
    );
    undo.execute({ playerId });
    e.jobs.step();
    expect(e.session.confirmedBox?.box).toEqual(original);
    for (const at of cellsOf(boxWithHeight(base, 3)))
      expect(e.world.stateAt(overworld, at)).toEqual(AIR);
  },
);

it("counts only the open-bottom shell when refusing an oversized stair roof", () => {
  const e = setup();
  const base = boxOf(
    cellOf({ x: 0, y: 64, z: 0 }),
    cellOf({ x: 319, y: 64, z: 319 }),
  );
  roof(e, base, "hip", stairs);
  const flow = e.session.flow;
  new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
    playerId,
    fill: "hollow",
  });
  expect(e.feedback.messages.at(-1)).toEqual({
    message: "tooLarge",
    count: 320 ** 2,
  });
  expect(e.session.flow).toBe(flow);
  expect(e.session.isEditing).toBe(false);
});

it.each([
  [overworld, OVERWORLD_RANGE],
  [nether, NETHER_RANGE],
] as const)(
  "accepts a stair roof at the %s ceiling and refuses one layer above",
  (dimensionId, range) => {
    const e = setup();
    e.world.heightRanges.set(dimensionId, range);
    const baseAt = (y: number) =>
      boxOf(cellOf({ x: 0, y, z: 0 }), cellOf({ x: 4, y, z: 6 }));
    roof(e, baseAt(range.maxY - 2), "gable", stairs, dimensionId);
    expect(e.session.flow).toMatchObject({ kind: "heightStep", liveHeight: 3 });
    const selected = roof(
      e,
      baseAt(range.maxY - 1),
      "gable",
      stairs,
      dimensionId,
    );
    expect(e.session.flow).toBe(selected);
    expect(e.feedback.messages.at(-1)?.message).toBe("tooLarge");
  },
);

it("refuses oversized and busy roofs without consuming the height stage", () => {
  const e = setup();
  const base = boxOf(
    cellOf({ x: 0, y: 0, z: 0 }),
    cellOf({ x: 1000, y: 0, z: 1000 }),
  );
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
  roof(
    e,
    boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 4, y: 0, z: 4 })),
    "hip",
  );
  const small = e.session.flow;
  e.session.beginEdit();
  confirm.execute({ playerId, fill: "hollow" });
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.flow).toBe(small);
  expect(e.world.writes).toBe(0);
});

it("refuses an invalid roof height without starting an edit", () => {
  const e = setup();
  roof(
    e,
    boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 4, y: 0, z: 4 })),
    "hip",
  );
  const flow = setHeight(e.session.flow, 0);
  e.session.setFlowForTest(flow);
  new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
    playerId,
    fill: "fill",
  });
  expect(e.session.flow).toBe(flow);
  expect(e.session.isEditing).toBe(false);
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
        const sourceBox = boxOf(
          cellOf(source),
          cellOf({
            x: source.x + size - 1,
            y: source.y + size - 1,
            z: source.z + size - 1,
          }),
        );
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
        e.session.setFlowForTest(beginPasteAim());
        const { anchor, box } = pasteTarget(
          clip,
          cellOf(block),
          face,
          turnBetween(clip.facing, "east"),
        );
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
          playerId,
          dimensionId: nether,
          target: pasteTarget(
            clip,
            cellOf(block),
            face,
            turnBetween(clip.facing, "east"),
          ),
        });
        expect(read.mock.calls).toEqual(
          [...cellsOf(box)].map((at) => [nether, at]),
        );
        expect(e.session.flow).toEqual(beginPasteAim());
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
        boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 1, y: 0, z: 0 })),
        () => undefined,
      ),
      cellOf({ x: 0, y: 0, z: 0 }),
      "up",
      turnBetween(
        structureClipboard(
          boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 1, y: 0, z: 0 })),
          () => undefined,
        ).facing,
        "east",
      ),
    ),
  };
  paste.execute(cmd);
  expect(e.feedback.messages).toEqual([]);
  e.session.setFlowForTest(beginPasteAim());
  const flow = e.session.flow;
  paste.execute(cmd);
  expect(e.feedback.messages.at(-1)?.message).toBe("noClipboard");
  expect(e.session.flow).toBe(flow);
  holdClipboard(
    e.session,
    structureClipboard(
      boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 1, y: 0, z: 0 })),
      () => undefined,
    ),
  );
  e.world.protectedCells.add(cellKey(cellOf({ x: 1, y: 1, z: 0 })));
  paste.execute(cmd);
  expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
  expect(e.session.flow).toBe(flow);
  e.world.protectedCells.clear();
  e.session.beginEdit();
  paste.execute(cmd);
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.flow).toBe(flow);
  expect(e.world.writes).toBe(0);
  e.session.setFlowForTest(cancel(e.session.flow));
  expect(e.session.flow).toEqual({ kind: "idle" });
});

it.each(["gable", "hip"] as const)(
  "rejects tube contents on a %s roof without changing the flow",
  (kind) => {
    const e = setup();
    roof(
      e,
      boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 4, y: 0, z: 4 })),
      kind,
    );
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
        const base = boxOf(
          cellOf({ x: 0, y: 60, z: 0 }),
          cellOf({ x: 4, y: 60, z: 5 }),
        );
        const choose = (box: ReturnType<typeof boxOf>) =>
          chooseHeightedFlow(
            {
              kind: "selected",
              menuLevel: "build",
              ...tappedSelection(
                selectionOf(overworld, box, stone),
                box.min,
                box.max,
              ),
            },
            kind,
          );
        e.session.setFlowForTest(choose(boxWithHeight(base, height)));
        const spec = { base, kind, height };
        new ConfirmHeighted(e.repo, e.feedback, e.jobs).execute({
          playerId,
          fill: "tube",
        });
        expect(e.session.flow).toMatchObject({
          kind: "selected",
          menuLevel: "root",
        });
        expect(e.session.flow).toHaveProperty(
          "selection",
          e.session.confirmedBox,
        );
        expect(e.session.confirmedBox).toEqual({
          material: stone,
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
          const large = { ...base, max: cellOf({ x: 100, y: 60, z: 100 }) };
          const flow = choose(boxWithHeight(large, 1000));
          e.session.setFlowForTest(flow);
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
