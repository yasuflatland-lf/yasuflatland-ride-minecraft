import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { ConfirmShape } from "../../../src/application/build/confirmShape";
import { CopySelection } from "../../../src/application/build/copySelection";
import { EditJobs } from "../../../src/application/build/editJobs";
import { SetPoint } from "../../../src/application/build/setPoint";
import { TapAir } from "../../../src/application/build/tapAir";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/flow";
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

const playerId = asPlayerId("alex");
const from = { x: 0, y: 64, z: 0 };
const to = { x: 2, y: 64, z: 2 };
const stone = blockStateOf("minecraft:stone", { variant: "granite" });
const dirt = blockStateOf("minecraft:dirt");
function setup() {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const jobs = new EditJobs(repo, world, feedback);
  const session = repo.getOrCreate(playerId);
  const point = new SetPoint(repo, world, feedback);
  const air = new TapAir(repo, feedback);
  const confirm = new ConfirmShape(repo, feedback, jobs);
  const copy = new CopySelection(repo, world, feedback);
  const endpoint = () =>
    session.setFlow(
      tapAir(tapBlock({ kind: "idle" }, overworld, from, stone), to),
    );
  return {
    repo,
    world,
    feedback,
    jobs,
    session,
    point,
    air,
    confirm,
    copy,
    endpoint,
  };
}

it("samples material only for a new point 1, clears the confirmed box, and reports the end count", () => {
  const e = setup();
  e.session.confirmBox(overworld, boxOf(from, to));
  e.world.put(from, stone);
  const material = vi.spyOn(e.world, "materialOf");
  e.point.execute({ playerId, dimensionId: overworld, cell: from });
  expect(e.session.confirmedBox).toBeUndefined();
  expect(e.session.flow).toEqual({
    kind: "point1",
    dimensionId: overworld,
    cell: from,
    material: stone,
  });
  e.point.execute({ playerId, dimensionId: overworld, cell: to });
  e.point.execute({ playerId, dimensionId: overworld, cell: to });
  expect(material).toHaveBeenCalledTimes(1);
  expect(e.session.flow).toEqual({
    kind: "endpoint",
    dimensionId: overworld,
    from,
    to,
    material: stone,
  });
  expect(e.feedback.messages).toEqual([
    { message: "pointSet", count: undefined },
    { message: "endSet", count: 9 },
    { message: "endSet", count: 9 },
  ]);
  e.world.put(to, dirt);
  e.point.execute({ playerId, dimensionId: nether, cell: to });
  expect(e.session.flow).toEqual({
    kind: "point1",
    dimensionId: nether,
    cell: to,
    material: dirt,
  });
  expect(material).toHaveBeenCalledTimes(2);
});

it("material refusal changes neither the flow nor the confirmed box", () => {
  for (const state of [
    undefined,
    blockStateOf("minecraft:air"),
    blockStateOf("minecraft:water"),
    blockStateOf("minecraft:chest"),
  ]) {
    const e = setup();
    e.session.confirmBox(overworld, boxOf(from, to));
    if (state) e.world.put(from, state);
    else e.world.unreadableCells.add(cellKey(from));
    const box = e.session.confirmedBox;
    e.point.execute({ playerId, dimensionId: overworld, cell: from });
    expect(e.session.flow).toEqual({ kind: "idle" });
    expect(e.session.confirmedBox).toBe(box);
    e.endpoint();
    const flow = e.session.flow;
    e.point.execute({ playerId, dimensionId: nether, cell: from });
    expect(e.session.flow).toBe(flow);
    expect(e.feedback.messages.at(-1)?.message).toBe("materialRefused");
  }
});

it("air taps without an end are inert, while an end fixes or updates the endpoint", () => {
  const e = setup();
  e.air.execute({ playerId, end: to });
  expect(e.session.flow.kind).toBe("idle");
  e.session.setFlow(tapBlock(e.session.flow, overworld, from, stone));
  const first = e.session.flow;
  e.air.execute({ playerId });
  expect(e.session.flow).toBe(first);
  e.air.execute({ playerId, end: to });
  expect(e.feedback.messages.at(-1)).toEqual({ message: "endSet", count: 9 });
  e.air.execute({ playerId, end: { ...to, x: 3 } });
  expect(e.feedback.messages.at(-1)).toEqual({ message: "endSet", count: 12 });
});

it("confirms the chosen shape with the captured material, retaining its box only for Copy", () => {
  const e = setup();
  e.endpoint();
  e.confirm.execute({ playerId, style: "frame" });
  expect(e.session.flow.kind).toBe("idle");
  expect(e.session.confirmedBox).toEqual({
    dimensionId: overworld,
    box: boxOf(from, to),
  });
  expect(e.session.isEditing).toBe(true);
  e.jobs.step();
  expect(e.world.writes).toBe(8);
  expect(e.world.stateAt(overworld, from)).toEqual(stone);
  expect(e.world.stateAt(overworld, { x: 1, y: 64, z: 1 })?.typeId).toBe(
    "minecraft:air",
  );
  e.copy.execute({ playerId });
  expect(e.session.clipboard?.cells).toHaveLength(9);
});

it("refuses oversized shapes with their count, unsupported styles, and busy jobs without changing the flow", () => {
  const e = setup();
  const end = { x: 100, y: 164, z: 100 };
  e.session.setFlow(
    tapAir(tapBlock(e.session.flow, overworld, from, stone), end),
  );
  const huge = e.session.flow;
  e.confirm.execute({ playerId, style: "fill" });
  expect(e.feedback.messages.at(-1)).toEqual({
    message: "tooLarge",
    count: 101 ** 3,
  });
  expect(e.session.flow).toBe(huge);
  expect(e.session.isEditing).toBe(false);
  e.endpoint();
  const flow = e.session.flow;
  e.confirm.execute({ playerId, style: "walls" });
  expect(e.session.flow).toBe(flow);
  expect(e.session.isEditing).toBe(false);
  e.session.beginEdit();
  e.confirm.execute({ playerId, style: "fill" });
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.flow).toBe(flow);
  expect(e.session.confirmedBox).toBeUndefined();
});

it("applies the limit to the chosen style rather than the bounding volume", () => {
  const e = setup();
  const end = { x: 49, y: 113, z: 49 };
  e.session.setFlow(
    tapAir(tapBlock(e.session.flow, overworld, from, stone), end),
  );
  e.confirm.execute({ playerId, style: "faces" });
  expect(e.session.isEditing).toBe(true);
  expect(e.session.flow.kind).toBe("idle");
});

it("CancelFlow cancels or returns to aiming without clearing the confirmed box, while Clear clears both", () => {
  const e = setup();
  e.session.confirmBox(nether, boxOf(from, to));
  e.endpoint();
  const box = e.session.confirmedBox;
  const cancel = new CancelFlow(e.repo);
  cancel.backToAiming({ playerId });
  expect(e.session.flow).toEqual({
    kind: "point1",
    dimensionId: overworld,
    cell: from,
    material: stone,
  });
  cancel.execute({ playerId });
  expect(e.session.flow.kind).toBe("idle");
  expect(e.session.confirmedBox).toBe(box);
  e.endpoint();
  const clip = clipboardOf(boxOf(from, to), () => stone);
  e.session.setClipboard(clip);
  new ClearSelection(e.repo, e.feedback).execute({ playerId });
  expect(e.session.flow.kind).toBe("idle");
  expect(e.session.confirmedBox).toBeUndefined();
  expect(e.session.clipboard).toBe(clip);
});

it("Copy refuses an unconfirmed endpoint and enforces the confirmed copy limit", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(BUILD_SPEC.maxCopyVolume, BUILD_SPEC.maxCopyVolume + 1),
      (size) => {
        const e = setup();
        e.endpoint();
        e.copy.execute({ playerId });
        expect(e.feedback.messages.at(-1)?.message).toBe("noSelection");
        const box = boxOf(from, { ...from, x: size - 1 });
        e.session.confirmBox(overworld, box);
        e.copy.execute({ playerId });
        if (size > BUILD_SPEC.maxCopyVolume) {
          expect(e.feedback.messages.at(-1)).toEqual({
            message: "tooLarge",
            count: size,
          });
          expect(e.session.clipboard).toBeUndefined();
        } else expect(e.session.clipboard?.cells).toHaveLength(size);
      },
    ),
    { numRuns: 4 },
  );
});
