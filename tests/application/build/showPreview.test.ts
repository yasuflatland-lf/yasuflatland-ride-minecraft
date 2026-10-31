import { expect, it, vi } from "vitest";
import { AimRoofHeight } from "../../../src/application/build/aimRoofHeight";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import type { AimReader } from "../../../src/application/build/ports/aim";
import { ShowPreview } from "../../../src/application/build/showPreview";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, nether, overworld } from "./fakes";

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
  const modes = new UpdateBuildModes(repo);
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
  aim.mockReturnValue({ ray, block: { cell: hit, face: "Up" } });
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
  session.setClipboard(clipboardOf(boxOf(cell, end), () => material));
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
  const modes = new UpdateBuildModes(repo);
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
    kind: "roofHeight",
    from: cell,
    dimensionId: nether,
    base: boxOf(cell, { x: 8, y: 64, z: 4 }),
    roofKind: "hip",
    previous: 3,
    material,
  });
  const flow = session.flow;
  aim.mockReturnValue({ ray });
  preview.execute(0);
  expect(session.flow).toBe(flow);
  new AimRoofHeight(repo).execute({ playerId: alex, ray });
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

it("anchors paste on a normalized face in the viewer dimension and ignores invalid or absent targets", () => {
  const { session, preview, feedback, aim } = setup();
  session.setFlow({ kind: "pasteAim", skipAir: false });
  aim.mockReturnValue({ ray, block: { cell, face: "UP" } });
  preview.execute(0);
  expect(feedback.previews).toEqual([]);
  session.setClipboard(clipboardOf(boxOf(cell, end), () => material));
  for (const face of ["Up", "DOWN", "north", "South", "east", "WEST"]) {
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
  for (const target of [
    { ray, block: { cell, face: "invalid" } },
    { ray },
    undefined,
  ]) {
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
  const modes = new UpdateBuildModes(repo);
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
