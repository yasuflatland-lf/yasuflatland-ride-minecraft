import { expect, it } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ChooseStairs } from "../../../src/application/build/chooseStairs";
import { ConfirmStairs } from "../../../src/application/build/confirmStairs";
import { EditJobs } from "../../../src/application/build/editJobs";
import { FixStairGoal } from "../../../src/application/build/fixStairGoal";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { ShowPreview } from "../../../src/application/build/showPreview";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeAimReader,
  FakeBuildPlayers,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("builder");
const command = { playerId };
const stone = blockStateOf("minecraft:stone");
const from = { x: 2, y: 10, z: 0 };
const to = { ...from, x: 0 };
const hit = { x: 5, y: 12, z: 4 };

function fixture() {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const aim = new FakeAimReader();
  const structures = new FakeStructureStore(world);
  const log = { info() {}, warn() {}, error() {} };
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    log,
    new FakeBuildPlayers(),
    structures,
  );
  const choose = new ChooseStairs(repo, feedback);
  const fix = new FixStairGoal(repo, feedback, aim);
  const confirm = new ConfirmStairs(repo, feedback, jobs);
  const undo = new UndoEdit(repo, feedback, jobs, world, structures, log);
  const cancel = new CancelFlow(repo);
  const preview = new ShowPreview(
    repo,
    feedback,
    aim,
    new ResolvePasteTarget(repo, new FakeGroundProbe()),
  );
  const session = repo.getOrCreate(playerId);
  const select = (material = stone, end = to) => {
    session.setFlow(
      tapAir(tapBlock({ kind: "idle" }, overworld, from, material), end),
    );
  };
  const aimAt = (cell = hit) => {
    aim.target = {
      ray: { origin: from, direction: { x: 0, y: 0, z: 1 } },
      block: { cell, face: "up" },
    };
  };
  return {
    choose,
    fix,
    confirm,
    undo,
    cancel,
    preview,
    session,
    select,
    aimAt,
    aim,
    world,
    feedback,
    jobs,
  };
}

it("refuses a missing row, an unstable material, and a missing or invalid goal", () => {
  const f = fixture();
  f.choose.execute(command);
  f.confirm.execute({ ...command, contents: "stepsOnly" });
  expect(f.feedback.messages.map(({ message }) => message)).toEqual([
    "noSelection",
    "noSelection",
  ]);
  f.select(stone, { ...from, y: from.y + 2 });
  f.choose.execute(command);
  expect(f.feedback.messages.at(-1)?.message).toBe("noSelection");
  f.select(blockStateOf("minecraft:sand"));
  f.choose.execute(command);
  expect(f.feedback.messages.at(-1)?.message).toBe("fillMaterialRefused");
  expect(f.session.flow.kind).toBe("selected");
  f.select();
  f.choose.execute(command);
  expect(f.feedback.messages.at(-1)?.message).toBe("aimStairGoal");
  const aiming = f.session.flow;
  expect(f.fix.execute(command)).toBe(false);
  expect(f.feedback.messages.at(-1)?.message).toBe("noStairGoal");
  f.aimAt({ ...hit, y: from.y });
  expect(f.fix.execute(command)).toBe(false);
  expect(f.feedback.messages.at(-1)?.message).toBe("noStairGoal");
  expect(f.session.flow).toBe(aiming);
});

it("refuses writes above maxVolume before starting the job", () => {
  const f = fixture();
  f.select(stone, { ...from, x: from.x - BUILD_SPEC.maxVolume });
  f.choose.execute(command);
  f.aimAt({ ...hit, z: 1 });
  expect(f.fix.execute(command)).toBe(true);
  f.confirm.execute({ ...command, contents: "stepsOnly" });
  f.jobs.step();
  expect(f.feedback.messages.at(-1)).toEqual({
    message: "tooLarge",
    count: (BUILD_SPEC.maxVolume + 1) * 2,
  });
  expect(f.world.writes).toBe(0);
  expect(f.session.hasHistory).toBe(false);
  expect(f.session.isEditing).toBe(false);
});

it("builds the step cells, selects the goal row, and restores the original row and cells on Undo", () => {
  const f = fixture();
  f.select();
  f.choose.execute(command);
  f.aimAt();
  expect(f.fix.execute(command)).toBe(true);
  f.confirm.execute({ ...command, contents: "stepsOnly" });
  expect(f.feedback.messages.at(-1)).toMatchObject({
    message: "building",
    material: stone,
  });
  f.jobs.step();
  const goalFrom = { x: 0, y: 12, z: 4 };
  const goalTo = { ...goalFrom, x: 2 };
  expect(f.session.confirmedBox?.box).toEqual(boxOf(goalFrom, goalTo));
  expect(f.session.flow).toMatchObject({
    kind: "selected",
    from: goalFrom,
    to: goalTo,
  });
  expect(f.world.stateAt(overworld, goalFrom)).toBe(stone);
  expect(f.world.writes).toBe(15);
  f.undo.execute(command);
  f.jobs.step();
  expect(f.session.confirmedBox?.box).toEqual(boxOf(from, to));
  expect(f.session.flow).toMatchObject({ kind: "selected", from, to });
  expect(f.world.stateAt(overworld, goalFrom)).toBe(AIR);
});

it("keeps the last valid preview while aiming and uses the fixed goal in contents", () => {
  const f = fixture();
  f.select();
  f.choose.execute(command);
  f.aimAt();
  f.preview.refresh(playerId, 0);
  const first = f.feedback.previews.at(-1)?.set.stairs;
  expect(first?.length).toBeGreaterThan(0);
  f.aim.target = undefined;
  f.preview.refresh(playerId, 0);
  expect(f.feedback.previews.at(-1)?.set.stairs).toEqual(first);
  f.aimAt({ ...hit, z: -4 });
  f.preview.refresh(playerId, 0);
  const latest = f.feedback.previews.at(-1)?.set.stairs;
  expect(latest).not.toEqual(first);
  expect(f.fix.execute(command)).toBe(true);
  f.aimAt();
  f.preview.refresh(playerId, 0);
  expect(f.feedback.previews.at(-1)?.set.stairs).toEqual(latest);
  f.cancel.backToAiming(command);
  f.select();
  f.choose.execute(command);
  f.aim.target = undefined;
  const previews = f.feedback.previews.length;
  f.preview.refresh(playerId, 0);
  expect(f.feedback.previews).toHaveLength(previews);
});

it("can Undo a goal-row advance when the steps already match", () => {
  const f = fixture();
  for (let x = 0; x <= 2; x++)
    for (const [z, y] of [
      [0, 10],
      [1, 11],
      [2, 11],
      [3, 12],
      [4, 12],
    ] as const)
      f.world.put({ x, y, z }, stone);
  f.select();
  f.choose.execute(command);
  f.aimAt();
  expect(f.fix.execute(command)).toBe(true);
  f.confirm.execute({ ...command, contents: "stepsOnly" });
  f.jobs.step();
  expect(f.world.writes).toBe(0);
  expect(f.session.hasHistory).toBe(true);
  f.undo.execute(command);
  f.jobs.step();
  expect(f.session.flow).toMatchObject({ kind: "selected", from, to });
  expect(f.session.confirmedBox?.box).toEqual(boxOf(from, to));
  expect(f.world.writes).toBe(0);
});

it("counts Passage steps, fill and cleared headroom in the completed edit", () => {
  const f = fixture();
  const dirt = blockStateOf("minecraft:dirt");
  for (let x = 0; x <= 2; x++)
    for (let z = 0; z <= 4; z++)
      for (let y = 10; y <= 15; y++) f.world.put({ x, y, z }, dirt);
  f.select();
  f.choose.execute(command);
  f.aimAt();
  expect(f.fix.execute(command)).toBe(true);
  f.confirm.execute({ ...command, contents: "passage" });
  f.jobs.step();
  expect(f.feedback.messages.at(-1)).toEqual({
    message: "editDoneCount",
    count: 15 + 6 + 45,
  });
});

it("refuses Passage when headroom puts the edit over maxVolume", () => {
  const f = fixture();
  const width = Math.floor(BUILD_SPEC.maxVolume / 8) + 1;
  f.select(stone, { ...from, x: from.x + width - 1 });
  f.choose.execute(command);
  f.aimAt({ ...hit, z: 1 });
  expect(f.fix.execute(command)).toBe(true);
  f.confirm.execute({ ...command, contents: "passage" });
  expect(f.feedback.messages.at(-1)).toEqual({
    message: "tooLarge",
    count: width * 8,
  });
  f.jobs.step();
  expect(f.world.writes).toBe(0);
  expect(f.session.isEditing).toBe(false);
  expect(f.session.hasHistory).toBe(false);
});
