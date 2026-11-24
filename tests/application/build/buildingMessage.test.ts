import { expect, it } from "vitest";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { ConfirmShape } from "../../../src/application/build/confirmShape";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CopySelection } from "../../../src/application/build/copySelection";
import { EditJobs } from "../../../src/application/build/editJobs";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("p");
const material = blockStateOf("minecraft:oak_planks", { example: true });
const from = { x: 0, y: 60, z: 0 };
const flat = { x: 4, y: 60, z: 4 };
const box = { x: 4, y: 64, z: 4 };

function setup(to = flat) {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  const world = new FakeWorld();
  const session = repo.getOrCreate(playerId);
  session.setFlow({
    kind: "selected",
    menuLevel: "root",
    selection: selectionOf(overworld, boxOf(from, to), material),
    from,
    to,
  });
  return { repo, feedback, world, session };
}

it.each([
  ["place", from, "fill"],
  ["line", { ...from, x: 4 }, "fill"],
  ["fill", flat, "fill"],
  ["frame", flat, "frame"],
  ["box fill", box, "fill"],
  ["faces", box, "faces"],
  ["walls", box, "walls"],
] as const)("shows the material for %s", (_name, to, style) => {
  const e = setup(to);
  new ConfirmShape(
    e.repo,
    e.feedback,
    new EditJobs(
      e.repo,
      e.world,
      e.feedback,
      { warn: () => {} },
      new FakeBuildPlayers(),
    ),
  ).execute({ playerId, style });
  expect(e.feedback.messages).toEqual([
    { message: "building", count: undefined, material },
  ]);
});

it.each(["gable", "hip", "cylinder", "sphere", "cube"] as const)(
  "shows the material when choosing %s",
  (kind) => {
    const e = setup();
    const choose = new ChooseHeighted(e.repo, e.feedback);
    choose.execute({ playerId, kind });
    choose.execute({ playerId, kind });
    expect(e.feedback.messages).toEqual([
      { message: "building", count: undefined, material },
    ]);
  },
);

it("does not announce building when copying or clearing the selection", () => {
  const e = setup();
  e.session.confirmBox(selectionOf(overworld, boxOf(from, flat), AIR));
  new CopySelection(
    e.repo,
    new CopyBox(e.repo, new FakeStructureStore(), e.feedback),
    e.feedback,
    { facingOf: () => "east" },
  ).execute({ playerId });
  new ClearSelection(e.repo, e.feedback).execute({ playerId });
  expect(
    e.feedback.messages.some(({ message }) => message === "building"),
  ).toBe(false);
});

it("does not announce a rejected or busy build", () => {
  const e = setup();
  new ConfirmShape(
    e.repo,
    e.feedback,
    new EditJobs(
      e.repo,
      e.world,
      e.feedback,
      { warn: () => {} },
      new FakeBuildPlayers(),
    ),
  ).execute({ playerId, style: "walls" });
  e.session.beginEdit();
  new ConfirmShape(
    e.repo,
    e.feedback,
    new EditJobs(
      e.repo,
      e.world,
      e.feedback,
      { warn: () => {} },
      new FakeBuildPlayers(),
    ),
  ).execute({ playerId, style: "fill" });
  expect(
    e.feedback.messages.some(({ message }) => message === "building"),
  ).toBe(false);
});
