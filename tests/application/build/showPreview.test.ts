import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import type { AimReader } from "../../../src/application/build/ports/aim";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotatePasteAim } from "../../../src/application/build/rotatePasteAim";
import { RotateSelection } from "../../../src/application/build/rotateSelection";
import { ShowPreview } from "../../../src/application/build/showPreview";
import { SyncTapTarget } from "../../../src/application/build/syncTapTarget";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { blockTapOf } from "../../../src/domain/build/blockTap";
import { boxOf } from "../../../src/domain/build/box";
import { cornerMarkerEdges } from "../../../src/domain/build/cornerMarker";
import { previewModel } from "../../../src/domain/build/preview/preview";
import {
  FACINGS,
  type Facing,
  facingVector,
} from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { NETHER_RANGE } from "../../helpers/buildHeightRange";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { tapAir, tappedSelection } from "../../support/buildSelection";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  FakeTapTargets,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const alex = asPlayerId("alex");
const material = blockStateOf("minecraft:stone");
const cell = cellOf({ x: 0, y: 64, z: 0 });
const end = cellOf({ x: 0, y: 66, z: 3 });
const ray = {
  origin: { x: -5, y: 66.5, z: 3.5 },
  direction: { x: 1, y: 0, z: 0 },
};
const interval = BUILD_SPEC.outlineInterval;

function setup(active = true) {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  const session = repo.getOrCreate(alex);
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeTapTargets()),
  );
  if (active)
    for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
      modes.execute([{ playerId: alex, held: "wand" }]);
  const aim = vi.fn<AimReader["aim"]>();
  const targets = new FakeTapTargets();
  const blocks = new FakeWorld();
  const syncTapTarget = new SyncTapTarget(blocks, targets);
  const preview = new ShowPreview(
    repo,
    feedback,
    { aim, dimensionOf: () => nether },
    new ResolvePasteTarget(repo, new FakeGroundProbe()),
    syncTapTarget,
    blocks,
  );
  return {
    repo,
    feedback,
    session,
    aim,
    preview,
    targets,
    syncTapTarget,
    blocks,
  };
}

it("shares one aim sample between the preview and tap target placement", () => {
  const { session, preview, feedback, aim, targets, syncTapTarget, blocks } =
    setup();
  blocks.heightRanges.set(nether, NETHER_RANGE);
  const clampedEnd = { ...end, y: NETHER_RANGE.maxY };
  const flow = {
    kind: "point1",
    start: { dimensionId: nether, cell, material },
  } as const;
  session.setFlowForTest(flow);
  const sample = {
    input: "touch",
    ray: { ...ray, origin: { ...ray.origin, x: -2, y: NETHER_RANGE.maxY + 1 } },
  } as const;
  aim.mockReturnValueOnce(sample);
  const sync = vi.spyOn(syncTapTarget, "execute");

  preview.refresh(alex, 0);

  expect(aim).toHaveBeenCalledExactlyOnceWith(alex);
  expect(sync.mock.calls[0]?.[0].aim).toBe(sample);
  expect(targets.placements.get(alex)).toEqual({
    dimensionId: nether,
    cell: clampedEnd,
  });
  expect(feedback.previews[0]?.set).toEqual(
    previewModel(flow, { blink: true, end: clampedEnd }).set,
  );
});

it("hides an inactive player's target without reading aim", () => {
  const { preview, aim, targets } = setup(false);
  targets.show(alex, { dimensionId: nether, cell });

  preview.refresh(alex, 0);

  expect(aim).not.toHaveBeenCalled();
  expect(targets.placements.has(alex)).toBe(false);
});

it("hides a target when the marked dimension differs from the player's dimension", () => {
  const { session, preview, aim, targets } = setup();
  session.setFlowForTest({
    kind: "point1",
    start: { dimensionId: overworld, cell, material },
  });
  targets.show(alex, { dimensionId: overworld, cell: end });
  aim.mockReturnValue({
    input: "touch",
    ray: { ...ray, origin: { ...ray.origin, x: -2 } },
  });

  preview.refresh(alex, 0);

  expect(targets.placements.has(alex)).toBe(false);
});

it("draws the marker for its owner in the flow dimension on alternate redraws", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlowForTest({
    kind: "point1",
    start: { dimensionId: nether, cell, material },
  });
  preview.execute(0);
  preview.execute(interval);
  preview.execute(2 * interval);
  expect(aim.mock.calls).toEqual([[alex], [alex], [alex]]);
  expect(feedback.previews).toHaveLength(2);
  for (const entry of feedback.previews) {
    expect(entry.playerId).toBe(alex);
    expect(entry.dimensionId).toBe(nether);
    expect(entry.set.startMarker).toHaveLength(
      cornerMarkerEdges(cellOf({ x: 0, y: 0, z: 0 })).length,
    );
  }
});

it("follows the aimed block and falls back to the air plane without changing the flow", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlowForTest({
    kind: "point1",
    start: { dimensionId: overworld, cell, material },
  });
  const flow = session.flow;
  const hit = cellOf({ x: 4, y: 70, z: 2 });
  aim.mockReturnValue({
    input: "pointer",
    ray,
    block: { cell: hit, face: "up" },
  });
  preview.execute(0);
  expect(feedback.previews[0]?.set).toEqual(
    previewModel(flow, { blink: true, end: hit }).set,
  );
  aim.mockReturnValue({ input: "pointer", ray });
  preview.execute(interval);
  expect(feedback.previews[1]?.set).toEqual(
    previewModel(flow, { blink: false, end }).set,
  );
  expect(session.flow).toBe(flow);
});

it("shows a virtual end marker beyond touch reach only for pointer aim", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlowForTest({
    kind: "point1",
    start: { dimensionId: overworld, cell, material },
  });
  for (const input of ["touch", "pointer"] as const) {
    aim.mockReturnValue({ input, ray });
    preview.execute(0);
  }
  expect(feedback.previews[0]?.set.endMarker).toEqual([]);
  expect(feedback.previews[0]?.set.shape).toEqual([]);
  expect(feedback.previews[1]?.set.endMarker.length).toBeGreaterThan(0);
});

it("keeps a fixed endpoint and does not preview an unrelated clipboard", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlowForTest({
    kind: "selected",
    menuLevel: "root",
    ...tappedSelection(
      selectionOf(overworld, boxOf(cell, end), material),
      cell,
      end,
    ),
  });
  holdClipboard(
    session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  aim.mockReturnValue({ input: "pointer", ray, block: { cell, face: "up" } });
  preview.execute(0);
  expect(feedback.previews[0]?.set).toEqual(
    previewModel(session.flow, { blink: true }).set,
  );
  expect(feedback.previews[0]?.set.startMarker).toHaveLength(
    cornerMarkerEdges(cellOf({ x: 0, y: 0, z: 0 })).length,
  );
  expect(feedback.previews[0]?.set.paste).toEqual([]);
});

it("draws only in build mode and on the interval, and clears the preview with the selection", () => {
  const { session, preview, feedback, repo, aim } = setup(false);
  session.setFlowForTest({
    kind: "point1",
    start: { dimensionId: overworld, cell, material },
  });
  preview.execute(0);
  expect(aim).not.toHaveBeenCalled();
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeTapTargets()),
  );
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([{ playerId: alex, held: "wand" }]);
  preview.execute(1);
  expect(aim).not.toHaveBeenCalled();
  expect(feedback.previews).toEqual([]);
  preview.execute(0);
  expect(feedback.previews).toHaveLength(1);
  feedback.previews.length = 0;
  new ClearSelection(repo, feedback).execute({ playerId: alex });
  session.confirmBox(selectionOf(overworld, boxOf(cell, end), AIR));
  preview.execute(0);
  expect(feedback.previews).toEqual([]);
});

it("uses the confirmation height calculation for roofs without mutating the session", () => {
  const { session, preview, feedback, aim, blocks } = setup();
  session.setFlowForTest({
    kind: "heightStep",
    heightLocked: false,
    base: boxOf(cell, cellOf({ x: 8, y: 64, z: 4 })),
    heightedKind: "hip",
    liveHeight: 3,
    start: { dimensionId: nether, cell, material },
    taps: { from: cell, to: cellOf({ x: 8, y: 64, z: 4 }) },
  });
  const flow = session.flow;
  aim.mockReturnValue({ input: "pointer", ray });
  preview.execute(0);
  expect(session.flow).toBe(flow);
  session.aimHeight(ray, blocks.heightRange(overworld));
  expect(feedback.previews[0]?.set).toEqual(
    previewModel(session.flow, { blink: true }).set,
  );
  expect(feedback.previews[0]?.dimensionId).toBe(nether);
  aim.mockReturnValue(undefined);
  preview.execute(interval);
  expect(feedback.previews[1]?.set).toEqual(
    previewModel(session.flow, { blink: false }).set,
  );
});

it("draws a fixed paste box in the tapped dimension without reading aim", () => {
  const { session, preview, feedback, aim } = setup();
  session.completeCopy(
    selectionOf(overworld, boxOf(cell, end), AIR),
    structureClipboard(boxOf(cell, end)),
  );
  aim.mockReturnValue({ input: "pointer", ray, block: { cell, face: "up" } });
  preview.execute(0);
  expect(feedback.previews).toEqual([]);
  session.tapPaste(blockTapOf(nether, cell, "up"), 0, "east");
  preview.execute(0);
  aim.mockReturnValue(undefined);
  preview.execute(0);
  expect(feedback.previews).toHaveLength(2);
  expect(feedback.previews[1]).toEqual(feedback.previews[0]);
  expect(feedback.previews[0]?.dimensionId).toBe(nether);
  expect(aim).not.toHaveBeenCalled();
  session.pasted();
  session.tapPaste(blockTapOf(overworld, cell, "up"), 0, "east");
  preview.execute(0);
  expect(feedback.previews).toHaveLength(2);
});

it("keeps concurrent players and their aim targets separate", () => {
  const { session, repo, preview, feedback, aim } = setup();
  const bob = asPlayerId("bob");
  const other = repo.getOrCreate(bob);
  session.setFlowForTest({
    kind: "point1",
    start: { dimensionId: overworld, cell, material },
  });
  other.setFlowForTest({
    kind: "point1",
    start: { dimensionId: nether, cell: end, material },
  });
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeTapTargets()),
  );
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([
      { playerId: alex, held: "wand" },
      { playerId: bob, held: "wand" },
    ]);
  aim.mockImplementation((id) => ({
    input: "pointer",
    ray,
    block: { cell: id === alex ? end : cell, face: "up" },
  }));
  preview.execute(0);
  expect(feedback.previews).toEqual([
    {
      playerId: alex,
      dimensionId: overworld,
      set: previewModel(session.flow, { blink: true, end }).set,
    },
    {
      playerId: bob,
      dimensionId: nether,
      set: previewModel(other.flow, { blink: true, end: cell }).set,
    },
  ]);
});

it("reports height-step sizes only on changes and resets each player's memo on exit", () => {
  const layer = fc.integer({ min: 1, max: 6 });
  const footprint = fc.integer({ min: 2, max: 9 });
  const shape = fc.record({
    heightedKind: fc.constantFrom(
      "gable",
      "hip",
      "cylinder",
      "sideCylinderX",
      "sideCylinderZ",
      "sphere",
      "cube",
    ),
    width: footprint,
    depth: footprint,
    heightLocked: fc.boolean(),
    liveHeight: layer,
  });
  const players = [alex, asPlayerId("bob")] as const;
  const otherFlow = fc.constantFrom(
    { kind: "idle" } as const,
    {
      kind: "point1",
      start: { dimensionId: overworld, cell, material },
    } as const,
    {
      kind: "selected",
      menuLevel: "root",
      ...tappedSelection(
        selectionOf(overworld, boxOf(cell, end), material),
        cell,
        end,
      ),
    } as const,
    { kind: "pasteAim", manualTurn: 0 } as const,
  );
  const action = fc.oneof(
    shape.map((shape) => ({ kind: "shape", shape }) as const),
    fc
      .option(layer, { nil: undefined })
      .map((layer) => ({ kind: "aim", layer }) as const),
    otherFlow.map((flow) => ({ kind: "leave", flow }) as const),
    fc.constant({ kind: "remove" } as const),
  );
  const schedule = fc.array(
    fc.tuple(fc.constantFrom(...players), action, fc.boolean()),
    { minLength: 2, maxLength: 16 },
  );
  fc.assert(
    fc.property(shape, schedule, (initial, steps) => {
      const { repo, aim, preview, feedback } = setup();
      const shapes = new Map<PlayerId, typeof initial>();
      const layers = new Map<PlayerId, number | undefined>();
      const previousSizes = new Map<
        PlayerId,
        { x: number; y: number; z: number }
      >();
      const expected: typeof feedback.sizes = [];
      let tick = 0;
      aim.mockImplementation((id) => {
        const layer = layers.get(id);
        if (layer === undefined) return undefined;
        return {
          input: "pointer",
          ray: { ...ray, origin: { ...ray.origin, y: cell.y + layer - 0.5 } },
        };
      });
      function enterHeightStep(id: PlayerId) {
        const session = repo.getOrCreate(id);
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          session.tickMode({ holding: true });
        const { width, depth, heightedKind, liveHeight, heightLocked } =
          shapes.get(id) ?? initial;
        session.setFlowForTest({
          kind: "heightStep",
          heightedKind,
          liveHeight,
          heightLocked,
          base: boxOf(cell, {
            ...cell,
            x: cell.x + width - 1,
            z: cell.z + depth - 1,
          }),
          start: { dimensionId: overworld, cell, material },
          taps: {
            from: cell,
            to: cellOf({
              ...cell,
              x: cell.x + width - 1,
              z: cell.z + depth - 1,
            }),
          },
        });
      }
      function recordExpectedSize(id: PlayerId) {
        const { width, depth, heightLocked, liveHeight } =
          shapes.get(id) ?? initial;
        const size = {
          x: width,
          y: heightLocked ? liveHeight : (layers.get(id) ?? liveHeight),
          z: depth,
        };
        const last = previousSizes.get(id);
        if (last?.x !== size.x || last.y !== size.y || last.z !== size.z)
          expected.push({ playerId: id, size });
        previousSizes.set(id, size);
      }
      function redraw() {
        for (let i = 0; i < 2; i++) {
          preview.execute(tick);
          tick += interval;
          expect(feedback.sizes).toEqual(expected);
        }
      }
      for (const id of players) {
        enterHeightStep(id);
        recordExpectedSize(id);
      }
      redraw();
      for (const [id, action, betweenRedraws] of steps) {
        if (action.kind === "shape") shapes.set(id, action.shape);
        if (action.kind === "aim") layers.set(id, action.layer);
        if (action.kind === "leave" || action.kind === "remove") {
          if (action.kind === "leave")
            repo.getOrCreate(id).setFlowForTest(action.flow);
          else repo.remove(id);
          previousSizes.delete(id);
          if (betweenRedraws) preview.execute(tick - 1);
          else redraw();
        }
        if (action.kind !== "aim") enterHeightStep(id);
        recordExpectedSize(id);
        redraw();
      }
      expect(feedback.messages).toEqual([]);
    }),
  );
});

it("reports a locked cylinder once and ignores changes in aim", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlowForTest({
    kind: "heightStep",
    heightLocked: true,
    base: boxOf(cell, cellOf({ x: 8, y: 64, z: 4 })),
    heightedKind: "cylinder",
    liveHeight: 12,
    start: { dimensionId: overworld, cell, material },
    taps: { from: cell, to: cellOf({ x: 8, y: 64, z: 4 }) },
  });
  preview.execute(0);
  aim.mockReturnValue({ input: "pointer", ray });
  preview.execute(interval);
  aim.mockReturnValue({
    input: "pointer",
    ray: { ...ray, origin: { ...ray.origin, y: 80 } },
  });
  preview.execute(2 * interval);
  expect(feedback.sizes).toEqual([
    { playerId: alex, size: { x: 9, y: 12, z: 5 } },
  ]);
});

it("refreshes the paste hint each interval without requiring an aimed block", () => {
  const { session, preview, feedback } = setup();
  session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
  preview.execute(0);
  expect(feedback.modes).toEqual([]);
  const clipboard = structureClipboard(boxOf(cell, end), (at) =>
    at.y === cell.y ? material : undefined,
  );
  holdClipboard(session, clipboard);
  for (let tick = 1; tick <= 3 * interval; tick++) preview.execute(tick);
  expect(feedback.modes).toEqual(
    Array.from({ length: 3 }, () => ({
      playerId: alex,
      mode: {
        kind: "pasteReady",
        size: { x: 1, y: 3, z: 4 },
        blockCount: 12,
        degrees: 0,
      },
    })),
  );
});

it("never shows paste hints in other flows or outside build mode", () => {
  const { session, preview, feedback } = setup();
  holdClipboard(
    session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  for (const flow of [
    { kind: "idle" } as const,
    {
      kind: "point1",
      start: { dimensionId: overworld, cell, material },
    } as const,
    {
      kind: "selected",
      menuLevel: "root",
      ...tappedSelection(
        selectionOf(overworld, boxOf(cell, end), material),
        cell,
        end,
      ),
    } as const,
    {
      kind: "heightStep",
      base: boxOf(cell, end),
      heightedKind: "cube",
      liveHeight: 3,
      heightLocked: false,
      start: { dimensionId: overworld, cell, material },
      taps: { from: cell, to: end },
    } as const,
  ]) {
    session.setFlowForTest(flow);
    preview.execute(0);
    preview.execute(interval);
  }
  expect(feedback.modes).toEqual([]);
  const inactive = setup(false);
  holdClipboard(
    inactive.session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  inactive.session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
  inactive.preview.execute(0);
  expect(inactive.feedback.modes).toEqual([]);
});

it("idle after New copy draws no paste layers or hints with a held clipboard", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.nat({ max: 100 }), (hit, redraw) => {
      const { session, feedback, aim, preview } = setup();
      session.completeCopy(
        selectionOf(overworld, boxOf(cell, end), AIR),
        structureClipboard(boxOf(cell, end), () => material),
      );
      session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
      session.startNewCopy();
      aim.mockReturnValue(
        hit
          ? { input: "pointer", ray, block: { cell, face: "up" } }
          : { input: "pointer", ray },
      );
      preview.execute(redraw * interval);
      expect(feedback.previews).toEqual([]);
      expect(feedback.modes).toEqual([]);
    }),
  );
});

it("shows the paste hint, and shows the outline and white anchor marker after a tap", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 5 }),
      fc.boolean(),
      (x, y, z, hit) => {
        const { session, preview, feedback } = setup();
        const box = boxOf(
          cell,
          cellOf({
            x: cell.x + x - 1,
            y: cell.y + y - 1,
            z: cell.z + z - 1,
          }),
        );
        const clipboard = structureClipboard(box, () => material);
        session.completeCopy(selectionOf(overworld, box, AIR), clipboard);
        if (hit) session.tapPaste(blockTapOf(nether, end, "up"), 0, "east");
        preview.execute(0);
        expect(feedback.modes).toEqual([
          {
            playerId: alex,
            mode: {
              kind: "pasteReady",
              size: { x, y, z },
              blockCount: x * y * z,
              degrees: 0,
            },
          },
        ]);
        expect(session.confirmedBox).toEqual({
          material: AIR,
          dimensionId: overworld,
          box,
        });
        if (hit) {
          expect(feedback.previews).toHaveLength(1);
          const set = feedback.previews[0]?.set;
          expect(set?.paste.length).toBeGreaterThan(0);
          expect((set?.pasteVertical.length ?? 0) > 0).toBe(y > 1);
          expect(set?.startMarker).toEqual(
            cornerMarkerEdges(cellOf({ ...end, y: end.y + 1 })),
          );
          for (const layer of ["shape", "endMarker", "roof"] as const)
            expect(set?.[layer]).toEqual([]);
        } else expect(feedback.previews).toEqual([]);
      },
    ),
  );
});

it("outlines the rotated paste box at each heading", () => {
  fc.assert(
    fc.property(fc.constantFrom(0, 1, 2, 3), (turn) => {
      const { session, preview, feedback } = setup();
      session.completeCopy(
        selectionOf(overworld, boxOf(cell, end), AIR),
        structureClipboard(boxOf(cell, end)),
      );
      const facing = (["east", "south", "west", "north"] as const)[
        turn
      ] as Facing;
      session.tapPaste(blockTapOf(nether, cell, "up"), 0, facing);
      preview.execute(0);
      const anchor = cellOf({ x: 0, y: 65, z: 0 });
      const max = [
        { x: 0, y: 67, z: 3 },
        { x: -3, y: 67, z: 0 },
        { x: 0, y: 67, z: -3 },
        { x: 3, y: 67, z: 0 },
      ][turn];
      if (!max) throw new Error("Missing expected corner");
      expect(feedback.previews[0]?.set).toEqual(
        previewModel(session.flow, {
          blink: true,
          pasteTarget: {
            corner: cellOf({ x: 0, y: 65, z: 0 }),
            box: boxOf(anchor, cellOf(max)),
          },
        }).set,
      );
    }),
  );
});

it("shows the copied orientation on resume and leaves the position prompt visible", () => {
  const e = setup();
  const box = boxOf(cell, end);
  e.session.completeCopy(
    selectionOf(overworld, box, AIR),
    structureClipboard(box),
  );
  e.session.startNewCopy();
  e.session.resumePasteAim();
  e.aim.mockReturnValue({
    input: "pointer",
    ray: { ...ray, direction: facingVector("south") },
    block: { cell, face: "up" },
  });
  e.preview.refreshAfterPastePress(alex, 1);
  expect(e.feedback.previews).toEqual([]);
  expect(e.aim).not.toHaveBeenCalled();
  expect(e.feedback.modes).toEqual([]);
  e.preview.execute(BUILD_SPEC.outlineInterval);
  expect(e.session.pasteTurn).toBe(0);
  expect(e.feedback.modes).toHaveLength(1);
});

it("refreshes only the requested player's rotated paste between outline ticks", () => {
  const e = setup();
  e.session.completeCopy(
    selectionOf(overworld, boxOf(cell, end), AIR),
    structureClipboard(boxOf(cell, end)),
  );
  e.session.tapPaste(blockTapOf(nether, cell, "up"), 0, "east");
  e.preview.execute(0);
  e.session.rotatePaste();
  e.feedback.previews.length = 0;
  e.aim.mockClear();
  e.preview.refresh(alex, 1);
  expect(e.aim).not.toHaveBeenCalled();
  expect(e.feedback.previews).toEqual([
    {
      playerId: alex,
      dimensionId: nether,
      set: previewModel(e.session.flow, {
        blink: true,
        pasteTarget: {
          corner: cellOf({ x: 0, y: 65, z: 0 }),
          box: boxOf(
            cellOf({ x: 0, y: 65, z: 0 }),
            cellOf({ x: -3, y: 67, z: 0 }),
          ),
        },
      }).set,
    },
  ]);
  e.preview.refresh(asPlayerId("missing"), 1);
  expect(e.feedback.previews).toHaveLength(1);
  const inactive = setup(false);
  inactive.preview.refresh(alex, 1);
  expect(inactive.aim).not.toHaveBeenCalled();
});

it("shows the effective degrees for every facing and manual turn, including no target and immediate refresh", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACINGS),
      fc.constantFrom(...FACINGS),
      fc.constantFrom(0, 1, 2, 3),
      fc.boolean(),
      (copied, gaze, manualTurn, hit) => {
        const e = setup();
        const box = boxOf(cell, end);
        e.session.completeCopy(selectionOf(overworld, box, AIR), {
          ...structureClipboard(box),
          facing: copied,
        });
        e.session.setFlowForTest({ kind: "pasteAim", manualTurn });
        e.aim.mockReturnValue({
          input: "pointer",
          ray: { ...ray, direction: facingVector(gaze) },
          block: hit ? { cell, face: "up" } : undefined,
        });
        if (hit) e.session.tapPaste(blockTapOf(nether, cell, "up"), 0, gaze);
        const expected =
          ((FACINGS.indexOf(hit ? gaze : copied) -
            FACINGS.indexOf(copied) +
            4 +
            manualTurn) %
            4) *
          90;
        e.preview.execute(1);
        const rotate = new RotatePasteAim(e.repo, e.feedback);
        for (let press = 0; press <= 4; press++) {
          e.preview.refresh(alex, 1);
          expect(e.feedback.modes.at(-1)?.mode).toEqual({
            kind: "pasteReady",
            size: e.session.clipboard?.size,
            blockCount: e.session.clipboard?.blockCount,
            degrees: (expected + press * 90) % 360,
          });
          if (press < 4) rotate.execute({ playerId: alex });
        }
        e.aim.mockReturnValue(undefined);
        e.preview.refresh(alex, 2);
        expect(e.feedback.modes.at(-1)?.mode).toMatchObject({
          degrees: expected,
        });
      },
    ),
  );
});

it("redraws the live selection outline and retains its last height for a vertical gaze", () => {
  const { session, preview, feedback, aim } = setup(false);
  const from = cellOf({ x: 0, y: 64, z: 0 });
  const to = cellOf({ x: 4, y: 64, z: 4 });
  session.setFlowForTest(
    tapAir(
      {
        kind: "point1",
        start: { dimensionId: overworld, cell: from, material },
      },
      to,
    ),
  );
  const origin = { x: -1.5, y: 80, z: 2.5 };
  aim.mockReturnValue({
    input: "pointer",
    ray: { origin, direction: { x: 1, y: 0, z: 0 } },
  });
  preview.execute(0);
  aim.mockReturnValue({
    input: "pointer",
    ray: { origin, direction: { x: 0.8, y: 0.6, z: 0 } },
  });
  preview.execute(interval - 1);
  expect(session.flow).toMatchObject({ kind: "baseHeight", liveHeight: 4 });
  expect(feedback.previews).toHaveLength(1);
  preview.execute(interval);
  aim.mockReturnValue({
    input: "pointer",
    ray: { origin, direction: { x: 0, y: 1, z: 0 } },
  });
  preview.execute(2 * interval);
  expect(
    feedback.previews.map(({ set }) => Math.max(...set.shape.map((p) => p.y))),
  ).toEqual([64.5, 67.5, 67.5]);
  expect(session.flow).toMatchObject({ kind: "baseHeight", liveHeight: 4 });
});

it("redraws faster while the gaze sets the height and at the usual pace otherwise", () => {
  const { session, preview, feedback, aim } = setup(false);
  const from = cellOf({ x: 0, y: 64, z: 0 });
  const to = cellOf({ x: 4, y: 64, z: 4 });
  const origin = { x: -1.5, y: 80, z: 2.5 };
  aim.mockReturnValue({
    input: "pointer",
    ray: { origin, direction: { x: 1, y: 0, z: 0 } },
  });
  session.setFlowForTest(
    tapAir(
      {
        kind: "point1",
        start: { dimensionId: overworld, cell: from, material },
      },
      to,
    ),
  );
  expect(session.flow.kind).toBe("baseHeight");
  const live = BUILD_SPEC.liveOutlineInterval;
  expect(live).toBeLessThan(interval);
  preview.execute(live);
  preview.execute(2 * live);
  expect(feedback.previews).toHaveLength(2);

  feedback.previews.length = 0;
  session.setFlowForTest({
    kind: "point1",
    start: { dimensionId: overworld, cell: from, material },
  });
  preview.execute(live);
  expect(feedback.previews).toHaveLength(0);
  preview.execute(interval);
  expect(feedback.previews).toHaveLength(1);
});

it("shows the live size while aiming the base height, once per change", () => {
  const { session, preview, feedback, aim } = setup(false);
  const from = cellOf({ x: 0, y: 64, z: 0 });
  const to = cellOf({ x: 4, y: 64, z: 2 });
  session.setFlowForTest(
    tapAir(
      {
        kind: "point1",
        start: { dimensionId: overworld, cell: from, material },
      },
      to,
    ),
  );
  const origin = { x: -1.5, y: 80, z: 1.5 };
  aim.mockReturnValue({
    input: "pointer",
    ray: { origin, direction: { x: 1, y: 0, z: 0 } },
  });
  const live = BUILD_SPEC.liveOutlineInterval;
  preview.execute(live);
  preview.execute(2 * live);
  expect(feedback.sizes).toHaveLength(1);
  expect(feedback.sizes[0]?.size).toMatchObject({ x: 5, z: 3 });
  expect(feedback.aimingSizes).toEqual([true]);
});

it("redraws the rotated outline and tap markers on the next outline tick", () => {
  const { repo, feedback, session, preview } = setup();
  const base = tapAir(
    { kind: "point1", start: { dimensionId: nether, cell, material } },
    end,
  );
  if (base.kind !== "baseHeight") throw new Error("Expected baseHeight");
  session.setFlowForTest({ ...base, liveHeight: 7 });
  preview.execute(0);
  const world = new FakeWorld();
  const core = new RotateBox(
    repo,
    world,
    new FakeBuildPlayers(),
    new FakeStructureStore(world),
    feedback,
    { warn: vi.fn() },
  );
  new RotateSelection(repo, core, feedback, world).execute({
    playerId: alex,
    dimensionId: nether,
  });
  preview.execute(interval);
  const turned = boxOf(
    cellOf({ x: -1, y: 64, z: 1 }),
    cellOf({ x: 2, y: 66, z: 1 }),
  );
  expect(feedback.previews).toHaveLength(2);
  expect(feedback.previews[1]?.set).toEqual(
    previewModel(
      {
        kind: "selected",
        menuLevel: "root",
        ...tappedSelection(
          selectionOf(nether, turned, material),
          turned.min,
          turned.max,
        ),
      },
      { blink: false },
    ).set,
  );
});
