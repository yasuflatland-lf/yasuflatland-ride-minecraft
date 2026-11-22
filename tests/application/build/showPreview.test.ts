import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { AimHeight } from "../../../src/application/build/aimHeight";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import type { AimReader } from "../../../src/application/build/ports/aim";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { RotatePasteAim } from "../../../src/application/build/rotatePasteAim";
import { ShowPreview } from "../../../src/application/build/showPreview";
import { SyncTapTarget } from "../../../src/application/build/syncTapTarget";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import { tapAir } from "../../../src/domain/build/flow/flow";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import {
  FACINGS,
  type Facing,
  facingVector,
} from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  FakeAimReader,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  FakeTapTargets,
  FakeWorld,
  fakeSyncTapTarget,
  nether,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const alex = asPlayerId("alex");
const material = blockStateOf("minecraft:stone");
const cell = { x: 0, y: 64, z: 0 };
const end = { x: 0, y: 66, z: 3 };
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
    new LeaveBuild(repo, new FakeStructureStore(), new FakeTapTargets()),
  );
  if (active)
    for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
      modes.execute([{ playerId: alex, held: "wand" }]);
  const aim = vi.fn<AimReader["aim"]>();
  const targets = new FakeTapTargets();
  const syncTapTarget = new SyncTapTarget(new FakeWorld(), targets);
  const preview = new ShowPreview(
    repo,
    feedback,
    { aim, dimensionOf: () => nether },
    new ResolvePasteTarget(repo, new FakeGroundProbe()),
    syncTapTarget,
  );
  return { repo, feedback, session, aim, preview, targets, syncTapTarget };
}

it("shares one aim sample between the preview and tap target placement", () => {
  const { session, preview, feedback, aim, targets, syncTapTarget } = setup();
  const flow = { kind: "point1", dimensionId: nether, cell, material } as const;
  session.setFlow(flow);
  const sample = {
    input: "touch",
    ray: { ...ray, origin: { ...ray.origin, x: -2 } },
  } as const;
  aim.mockReturnValueOnce(sample);
  const sync = vi.spyOn(syncTapTarget, "execute");

  preview.refresh(alex, 0);

  expect(aim).toHaveBeenCalledExactlyOnceWith(alex);
  expect(sync.mock.calls[0]?.[0].aim).toBe(sample);
  expect(targets.placements.get(alex)).toEqual({
    dimensionId: nether,
    cell: end,
  });
  expect(feedback.previews[0]?.set).toEqual(
    previewPoints(flow, { blink: true, end }),
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
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
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
  session.setFlow({ kind: "point1", dimensionId: nether, cell, material });
  preview.execute(0);
  preview.execute(interval);
  preview.execute(2 * interval);
  expect(aim.mock.calls).toEqual([[alex], [alex], [alex]]);
  expect(feedback.previews).toHaveLength(2);
  for (const entry of feedback.previews) {
    expect(entry.playerId).toBe(alex);
    expect(entry.dimensionId).toBe(nether);
    expect(entry.set.startMarker).toHaveLength(
      cornerMarkerPoints({ x: 0, y: 0, z: 0 }).length,
    );
  }
});

it("follows the aimed block and falls back to the air plane without changing the flow", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
  const flow = session.flow;
  const hit = { x: 4, y: 70, z: 2 };
  aim.mockReturnValue({
    input: "pointer",
    ray,
    block: { cell: hit, face: "up" },
  });
  preview.execute(0);
  expect(feedback.previews[0]?.set).toEqual(
    previewPoints(flow, { blink: true, end: hit }),
  );
  aim.mockReturnValue({ input: "pointer", ray });
  preview.execute(interval);
  expect(feedback.previews[1]?.set).toEqual(
    previewPoints(flow, { blink: false, end }),
  );
  expect(session.flow).toBe(flow);
});

it("shows a virtual end marker beyond touch reach only for pointer aim", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
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
  session.setFlow({
    kind: "selected",
    menuLevel: "root",
    selection: selectionOf(overworld, boxOf(cell, end), material),
    from: cell,
    to: end,
  });
  holdClipboard(
    session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  aim.mockReturnValue({ input: "pointer", ray, block: { cell, face: "up" } });
  preview.execute(0);
  expect(feedback.previews[0]?.set).toEqual(
    previewPoints(session.flow, { blink: true }),
  );
  expect(feedback.previews[0]?.set.startMarker).toHaveLength(
    cornerMarkerPoints({ x: 0, y: 0, z: 0 }).length,
  );
  expect(feedback.previews[0]?.set.paste).toEqual([]);
});

it("draws only in build mode and on the interval, and clears the preview with the selection", () => {
  const { session, preview, feedback, repo, aim } = setup(false);
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
  preview.execute(0);
  expect(aim).not.toHaveBeenCalled();
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeStructureStore(), new FakeTapTargets()),
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
  const { session, preview, feedback, repo, aim } = setup();
  session.setFlow({
    kind: "heightStep",
    heightLocked: false,
    dimensionId: nether,
    from: cell,
    base: boxOf(cell, { x: 8, y: 64, z: 4 }),
    heightedKind: "hip",
    previous: 3,
    material,
  });
  const flow = session.flow;
  aim.mockReturnValue({ input: "pointer", ray });
  preview.execute(0);
  expect(session.flow).toBe(flow);
  new AimHeight(repo).execute({ playerId: alex, ray });
  expect(feedback.previews[0]?.set).toEqual(
    previewPoints(session.flow, { blink: true }),
  );
  expect(feedback.previews[0]?.dimensionId).toBe(nether);
  aim.mockReturnValue(undefined);
  preview.execute(interval);
  expect(feedback.previews[1]?.set).toEqual(
    previewPoints(session.flow, { blink: false }),
  );
});

it("anchors paste on each typed face in the viewer dimension and ignores absent targets", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlow({ kind: "pasteAim", manualTurn: 0 });
  aim.mockReturnValue({ input: "pointer", ray, block: { cell, face: "up" } });
  preview.execute(0);
  expect(feedback.previews).toEqual([]);
  holdClipboard(
    session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  for (const face of [
    "up",
    "down",
    "north",
    "south",
    "east",
    "west",
  ] as const) {
    aim.mockReturnValue({ input: "pointer", ray, block: { cell, face } });
    preview.execute(0);
  }
  expect(feedback.previews).toHaveLength(6);
  expect(feedback.previews[0]).toEqual({
    playerId: alex,
    dimensionId: nether,
    set: previewPoints(session.flow, {
      blink: true,
      pasteBox: boxOf({ x: 0, y: 65, z: 0 }, { x: 0, y: 67, z: 3 }),
    }),
  });
  for (const target of [{ input: "pointer" as const, ray }, undefined]) {
    aim.mockReturnValue(target);
    preview.execute(0);
  }
  expect(feedback.previews).toHaveLength(6);
});

it("keeps concurrent players and their aim targets separate", () => {
  const { session, repo, preview, feedback, aim } = setup();
  const bob = asPlayerId("bob");
  const other = repo.getOrCreate(bob);
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
  other.setFlow({ kind: "point1", dimensionId: nether, cell: end, material });
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeStructureStore(), new FakeTapTargets()),
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
      set: previewPoints(session.flow, { blink: true, end }),
    },
    {
      playerId: bob,
      dimensionId: nether,
      set: previewPoints(other.flow, { blink: true, end: cell }),
    },
  ]);
});

it.each(["gable", "hip", "cylinder", "sphere", "cube"] as const)(
  "reports %s size only when it changes and resets after leaving the height step",
  (heightedKind) => {
    const { session, preview, feedback, aim } = setup();
    const flow = {
      kind: "heightStep" as const,
      heightLocked: false,
      dimensionId: overworld,
      from: cell,
      base: boxOf(cell, { x: 8, y: 64, z: 4 }),
      heightedKind,
      previous: 3,
      material,
    };
    session.setFlow(flow);
    aim.mockReturnValue({ input: "pointer", ray });
    preview.execute(0);
    preview.execute(interval);
    expect(feedback.sizes).toEqual([
      { playerId: alex, size: { x: 9, y: 3, z: 5 } },
    ]);
    aim.mockReturnValue({
      input: "pointer",
      ray: { ...ray, origin: { ...ray.origin, y: 69.5 } },
    });
    preview.execute(2 * interval);
    preview.execute(3 * interval);
    expect(feedback.sizes).toEqual([
      { playerId: alex, size: { x: 9, y: 3, z: 5 } },
      { playerId: alex, size: { x: 9, y: 6, z: 5 } },
    ]);
    session.setFlow({ kind: "idle" });
    preview.execute(3 * interval + 1);
    session.setFlow(flow);
    preview.execute(4 * interval);
    expect(feedback.sizes).toHaveLength(3);
    expect(feedback.messages).toEqual([]);
  },
);

it("reports a locked cylinder once and ignores changes in aim", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlow({
    kind: "heightStep",
    heightLocked: true,
    dimensionId: overworld,
    from: cell,
    base: boxOf(cell, { x: 8, y: 64, z: 4 }),
    heightedKind: "cylinder",
    previous: 12,
    material,
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

it("does not report sizes outside the height step", () => {
  const { session, preview, feedback, aim } = setup();
  aim.mockReturnValue({ input: "pointer", ray });
  preview.execute(0);
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
  preview.execute(interval);
  session.setFlow({
    kind: "selected",
    menuLevel: "root",
    selection: selectionOf(overworld, boxOf(cell, end), material),
    from: cell,
    to: end,
  });
  preview.execute(2 * interval);
  session.setFlow({ kind: "pasteAim", manualTurn: 0 });
  preview.execute(3 * interval);
  expect(feedback.sizes).toEqual([]);
});

it("memoizes sizes independently for each player and forgets removed sessions", () => {
  const { session, repo, preview, feedback } = setup();
  const bob = asPlayerId("bob");
  const other = repo.getOrCreate(bob);
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeStructureStore(), new FakeTapTargets()),
  );
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([
      { playerId: alex, held: "wand" },
      { playerId: bob, held: "wand" },
    ]);
  const flow = {
    kind: "heightStep" as const,
    heightLocked: false,
    dimensionId: overworld,
    from: cell,
    base: boxOf(cell, { x: 8, y: 64, z: 4 }),
    heightedKind: "cube" as const,
    previous: 3,
    material,
  };
  session.setFlow(flow);
  other.setFlow(flow);
  preview.execute(0);
  session.setFlow({ ...flow, base: boxOf(cell, { x: 5, y: 64, z: 7 }) });
  preview.execute(interval);
  expect(feedback.sizes).toEqual([
    { playerId: alex, size: { x: 9, y: 3, z: 5 } },
    { playerId: bob, size: { x: 9, y: 3, z: 5 } },
    { playerId: alex, size: { x: 6, y: 3, z: 8 } },
  ]);
  repo.remove(bob);
  preview.execute(2 * interval);
  const returning = repo.getOrCreate(bob);
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([
      { playerId: alex, held: "wand" },
      { playerId: bob, held: "wand" },
    ]);
  returning.setFlow(flow);
  preview.execute(3 * interval);
  expect(feedback.sizes).toHaveLength(4);
  expect(feedback.sizes[3]?.playerId).toBe(bob);
});

it("refreshes the paste hint each interval without requiring an aimed block", () => {
  const { session, preview, feedback } = setup();
  session.setFlow({ kind: "pasteAim", manualTurn: 0 });
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
    { kind: "point1", dimensionId: overworld, cell, material } as const,
    {
      kind: "selected",
      menuLevel: "root",
      selection: selectionOf(overworld, boxOf(cell, end), material),
      from: cell,
      to: end,
    } as const,
    {
      kind: "heightStep",
      dimensionId: overworld,
      from: cell,
      base: boxOf(cell, end),
      heightedKind: "cube",
      previous: 3,
      heightLocked: false,
      material,
    } as const,
  ]) {
    session.setFlow(flow);
    preview.execute(0);
    preview.execute(interval);
  }
  expect(feedback.modes).toEqual([]);
  const inactive = setup(false);
  holdClipboard(
    inactive.session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  inactive.session.setFlow({ kind: "pasteAim", manualTurn: 0 });
  inactive.preview.execute(0);
  expect(inactive.feedback.modes).toEqual([]);
});

it("flow.kind === 'pasteAim' draws no paste layers with a clipboard but no aimed block", () => {
  const { repo, session, feedback } = setup();
  session.setFlow({ kind: "pasteAim", manualTurn: 0 });
  holdClipboard(
    session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  const aim = new FakeAimReader();
  const preview = new ShowPreview(
    repo,
    feedback,
    aim,
    new ResolvePasteTarget(repo, new FakeGroundProbe()),
    fakeSyncTapTarget(),
  );
  for (const target of [{ input: "pointer" as const, ray }, undefined]) {
    aim.target = target;
    preview.execute(0);
  }
  expect(feedback.previews).toEqual([]);
  expect(feedback.modes).toHaveLength(2);
});

it("idle after New copy draws no paste layers or hints with a held clipboard", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.nat({ max: 100 }), (hit, redraw) => {
      const { session, feedback, aim, preview } = setup();
      session.completeCopy(
        selectionOf(overworld, boxOf(cell, end), AIR),
        structureClipboard(boxOf(cell, end), () => material),
      );
      session.setFlow({ kind: "pasteAim", manualTurn: 0 });
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

it("shows the hint and only paste layers after copying a confirmed box", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 1, max: 5 }),
      fc.boolean(),
      (x, y, z, hit) => {
        const { session, preview, feedback, aim } = setup();
        const box = boxOf(cell, {
          x: cell.x + x - 1,
          y: cell.y + y - 1,
          z: cell.z + z - 1,
        });
        const clipboard = structureClipboard(box, () => material);
        session.completeCopy(selectionOf(overworld, box, AIR), clipboard);
        aim.mockReturnValue(
          hit
            ? { input: "pointer", ray, block: { cell: end, face: "up" } }
            : { input: "pointer", ray },
        );
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
          for (const layer of [
            "startMarker",
            "shape",
            "endMarker",
            "roof",
          ] as const)
            expect(set?.[layer]).toEqual([]);
        } else expect(feedback.previews).toEqual([]);
      },
    ),
  );
});

it("outlines the rotated paste box at each heading", () => {
  fc.assert(
    fc.property(fc.constantFrom(0, 1, 2, 3), (turn) => {
      const { session, preview, feedback, aim } = setup();
      session.completeCopy(
        selectionOf(overworld, boxOf(cell, end), AIR),
        structureClipboard(boxOf(cell, end)),
      );
      const facing = (["east", "south", "west", "north"] as const)[
        turn
      ] as Facing;
      aim.mockReturnValue({
        input: "pointer",
        ray: { ...ray, direction: facingVector(facing) },
        block: { cell, face: "up" },
      });
      preview.execute(0);
      const anchor = { x: 0, y: 65, z: 0 };
      const max = [
        { x: 0, y: 67, z: 3 },
        { x: -3, y: 67, z: 0 },
        { x: 0, y: 67, z: -3 },
        { x: 3, y: 67, z: 0 },
      ][turn];
      if (!max) throw new Error("Missing expected corner");
      expect(feedback.previews[0]?.set).toEqual(
        previewPoints(session.flow, {
          blink: true,
          pasteBox: boxOf(anchor, max),
        }),
      );
    }),
  );
});

it("refreshes only the requested player's rotated paste between outline ticks", () => {
  const e = setup();
  e.session.completeCopy(
    selectionOf(overworld, boxOf(cell, end), AIR),
    structureClipboard(boxOf(cell, end)),
  );
  e.aim.mockReturnValue({ input: "pointer", ray, block: { cell, face: "up" } });
  e.preview.execute(0);
  e.session.rotatePaste();
  e.feedback.previews.length = 0;
  e.aim.mockClear();
  e.preview.refresh(alex, 1);
  expect(e.aim).toHaveBeenCalledExactlyOnceWith(alex);
  expect(e.feedback.previews).toEqual([
    {
      playerId: alex,
      dimensionId: nether,
      set: previewPoints(e.session.flow, {
        blink: true,
        pasteBox: boxOf({ x: 0, y: 65, z: 0 }, { x: 3, y: 67, z: 0 }),
      }),
    },
  ]);
  e.preview.refresh(asPlayerId("missing"), 1);
  expect(e.feedback.previews).toHaveLength(1);
  const inactive = setup(false);
  inactive.preview.refresh(alex, 1);
  expect(inactive.aim).not.toHaveBeenCalled();
});

it("shows the effective degrees for every facing and manual turn, including air aim and immediate refresh", () => {
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
        e.session.setFlow({ kind: "pasteAim", manualTurn });
        e.aim.mockReturnValue({
          input: "pointer",
          ray: { ...ray, direction: facingVector(gaze) },
          block: hit ? { cell, face: "up" } : undefined,
        });
        const expected =
          ((FACINGS.indexOf(gaze) - FACINGS.indexOf(copied) + 4 + manualTurn) %
            4) *
          90;
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
  const from = { x: 0, y: 64, z: 0 };
  const to = { x: 4, y: 64, z: 4 };
  session.setFlow(
    tapAir(
      { kind: "point1", dimensionId: overworld, cell: from, material },
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
  preview.execute(interval);
  aim.mockReturnValue({
    input: "pointer",
    ray: { origin, direction: { x: 0, y: 1, z: 0 } },
  });
  preview.execute(2 * interval);
  expect(
    feedback.previews.map(({ set }) => Math.max(...set.shape.map((p) => p.y))),
  ).toEqual([64.5, 67.5, 67.5]);
  expect(session.flow).toMatchObject({ kind: "baseHeight", previous: 4 });
});

it("redraws faster while the gaze sets the height and at the usual pace otherwise", () => {
  const { session, preview, feedback, aim } = setup(false);
  const from = { x: 0, y: 64, z: 0 };
  const to = { x: 4, y: 64, z: 4 };
  const origin = { x: -1.5, y: 80, z: 2.5 };
  aim.mockReturnValue({
    input: "pointer",
    ray: { origin, direction: { x: 1, y: 0, z: 0 } },
  });
  session.setFlow(
    tapAir(
      { kind: "point1", dimensionId: overworld, cell: from, material },
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
  session.setFlow({
    kind: "point1",
    dimensionId: overworld,
    cell: from,
    material,
  });
  preview.execute(live);
  expect(feedback.previews).toHaveLength(0);
  preview.execute(interval);
  expect(feedback.previews).toHaveLength(1);
});

it("shows the live size while aiming the base height, once per change", () => {
  const { session, preview, feedback, aim } = setup(false);
  const from = { x: 0, y: 64, z: 0 };
  const to = { x: 4, y: 64, z: 2 };
  session.setFlow(
    tapAir(
      { kind: "point1", dimensionId: overworld, cell: from, material },
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
