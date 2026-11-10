import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { AimHeight } from "../../../src/application/build/aimHeight";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import type { AimReader } from "../../../src/application/build/ports/aim";
import { ShowPreview } from "../../../src/application/build/showPreview";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  FakeAimReader,
  FakeFeedback,
  FakeSessions,
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
    new LeaveBuild(repo, new FakeStructureStore()),
  );
  if (active)
    for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
      modes.execute([{ playerId: alex, holding: true }]);
  const aim = vi.fn<AimReader["aim"]>();
  const preview = new ShowPreview(repo, feedback, { aim });
  return { repo, feedback, session, aim, preview };
}

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
    expect(entry.set.marker).toHaveLength(20);
  }
});

it("follows the aimed block and falls back to the air plane without changing the flow", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
  const flow = session.flow;
  const hit = { x: 4, y: 70, z: 2 };
  aim.mockReturnValue({ ray, block: { cell: hit, face: "up" } });
  preview.execute(0);
  expect(feedback.previews[0]?.set).toEqual(
    previewPoints(flow, { blink: true, end: hit }),
  );
  aim.mockReturnValue({ ray });
  preview.execute(interval);
  expect(feedback.previews[1]?.set).toEqual(
    previewPoints(flow, { blink: false, end }),
  );
  expect(session.flow).toBe(flow);
});

it("keeps a fixed endpoint and does not preview an unrelated clipboard", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlow({
    kind: "endpoint",
    dimensionId: overworld,
    from: cell,
    to: end,
    material,
  });
  holdClipboard(
    session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  aim.mockReturnValue({ ray, block: { cell, face: "up" } });
  preview.execute(0);
  expect(feedback.previews[0]?.set).toEqual(
    previewPoints(session.flow, { blink: true }),
  );
  expect(feedback.previews[0]?.set.marker).toEqual([]);
  expect(feedback.previews[0]?.set.paste).toEqual([]);
});

it("draws only in build mode and on the interval, and clears the preview with the selection", () => {
  const { session, preview, feedback, repo, aim } = setup(false);
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
  preview.execute(0);
  expect(aim).not.toHaveBeenCalled();
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeStructureStore()),
  );
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([{ playerId: alex, holding: true }]);
  preview.execute(1);
  expect(aim).not.toHaveBeenCalled();
  expect(feedback.previews).toEqual([]);
  preview.execute(0);
  expect(feedback.previews).toHaveLength(1);
  feedback.previews.length = 0;
  new ClearSelection(repo, feedback).execute({ playerId: alex });
  session.confirmBox(overworld, boxOf(cell, end));
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
  aim.mockReturnValue({ ray });
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
  session.setFlow({ kind: "pasteAim" });
  aim.mockReturnValue({ ray, block: { cell, face: "up" } });
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
    aim.mockReturnValue({ ray, block: { cell, face } });
    preview.execute(0);
  }
  expect(feedback.previews).toHaveLength(6);
  expect(feedback.previews[0]).toEqual({
    playerId: alex,
    dimensionId: undefined,
    set: previewPoints(session.flow, {
      blink: true,
      pasteBox: boxOf({ x: 0, y: 65, z: 0 }, { x: 0, y: 67, z: 3 }),
    }),
  });
  for (const target of [{ ray }, undefined]) {
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
    new LeaveBuild(repo, new FakeStructureStore()),
  );
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([
      { playerId: alex, holding: true },
      { playerId: bob, holding: true },
    ]);
  aim.mockImplementation((id) => ({
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
    aim.mockReturnValue({ ray });
    preview.execute(0);
    preview.execute(interval);
    expect(feedback.sizes).toEqual([
      { playerId: alex, size: { x: 9, y: 3, z: 5 } },
    ]);
    aim.mockReturnValue({
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
  aim.mockReturnValue({ ray });
  preview.execute(interval);
  aim.mockReturnValue({ ray: { ...ray, origin: { ...ray.origin, y: 80 } } });
  preview.execute(2 * interval);
  expect(feedback.sizes).toEqual([
    { playerId: alex, size: { x: 9, y: 12, z: 5 } },
  ]);
});

it("does not report sizes outside the height step", () => {
  const { session, preview, feedback, aim } = setup();
  aim.mockReturnValue({ ray });
  preview.execute(0);
  session.setFlow({ kind: "point1", dimensionId: overworld, cell, material });
  preview.execute(interval);
  session.setFlow({
    kind: "endpoint",
    dimensionId: overworld,
    from: cell,
    to: end,
    material,
  });
  preview.execute(2 * interval);
  session.setFlow({ kind: "pasteAim" });
  preview.execute(3 * interval);
  expect(feedback.sizes).toEqual([]);
});

it("memoizes sizes independently for each player and forgets removed sessions", () => {
  const { session, repo, preview, feedback } = setup();
  const bob = asPlayerId("bob");
  const other = repo.getOrCreate(bob);
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, new FakeStructureStore()),
  );
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([
      { playerId: alex, holding: true },
      { playerId: bob, holding: true },
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
      { playerId: alex, holding: true },
      { playerId: bob, holding: true },
    ]);
  returning.setFlow(flow);
  preview.execute(3 * interval);
  expect(feedback.sizes).toHaveLength(4);
  expect(feedback.sizes[3]?.playerId).toBe(bob);
});

it("refreshes the paste hint each interval without requiring an aimed block", () => {
  const { session, preview, feedback } = setup();
  session.setFlow({ kind: "pasteAim" });
  preview.execute(0);
  expect(feedback.pasteHints).toEqual([]);
  const clipboard = structureClipboard(boxOf(cell, end), (at) =>
    at.y === cell.y ? material : undefined,
  );
  holdClipboard(session, clipboard);
  for (let tick = 1; tick <= 3 * interval; tick++) preview.execute(tick);
  expect(feedback.pasteHints).toEqual(
    Array.from({ length: 3 }, () => ({
      playerId: alex,
      size: { x: 1, y: 3, z: 4 },
      count: 12,
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
      kind: "endpoint",
      dimensionId: overworld,
      from: cell,
      to: end,
      material,
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
  expect(feedback.pasteHints).toEqual([]);
  const inactive = setup(false);
  holdClipboard(
    inactive.session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  inactive.session.setFlow({ kind: "pasteAim" });
  inactive.preview.execute(0);
  expect(inactive.feedback.pasteHints).toEqual([]);
});

it("flow.kind === 'pasteAim' draws no paste layers with a clipboard but no aimed block", () => {
  const { repo, session, feedback } = setup();
  session.setFlow({ kind: "pasteAim" });
  holdClipboard(
    session,
    structureClipboard(boxOf(cell, end), () => material),
  );
  const aim = new FakeAimReader();
  const preview = new ShowPreview(repo, feedback, aim);
  for (const target of [{ ray }, undefined]) {
    aim.target = target;
    preview.execute(0);
  }
  expect(feedback.previews).toEqual([]);
  expect(feedback.pasteHints).toHaveLength(2);
});

it("idle after New copy draws no paste layers or hints with a held clipboard", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.nat({ max: 100 }), (hit, redraw) => {
      const { session, feedback, aim, preview } = setup();
      session.completeCopy(
        overworld,
        boxOf(cell, end),
        structureClipboard(boxOf(cell, end), () => material),
      );
      session.setFlow({ kind: "pasteAim" });
      session.startNewCopy();
      aim.mockReturnValue(hit ? { ray, block: { cell, face: "up" } } : { ray });
      preview.execute(redraw * interval);
      expect(feedback.previews).toEqual([]);
      expect(feedback.pasteHints).toEqual([]);
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
        session.completeCopy(overworld, box, clipboard);
        aim.mockReturnValue(
          hit ? { ray, block: { cell: end, face: "up" } } : { ray },
        );
        preview.execute(0);
        expect(feedback.pasteHints).toEqual([
          { playerId: alex, size: { x, y, z }, count: x * y * z },
        ]);
        expect(session.confirmedBox).toEqual({ dimensionId: overworld, box });
        if (hit) {
          expect(feedback.previews).toHaveLength(1);
          const set = feedback.previews[0]?.set;
          expect(set?.paste.length).toBeGreaterThan(0);
          for (const layer of [
            "marker",
            "shape",
            "endCube",
            "roof",
            "boxStep",
            "boxStepOver",
          ] as const)
            expect(set?.[layer]).toEqual([]);
        } else expect(feedback.previews).toEqual([]);
      },
    ),
  );
});
