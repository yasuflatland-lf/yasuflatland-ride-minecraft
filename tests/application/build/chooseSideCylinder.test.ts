import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { ChooseSideCylinder } from "../../../src/application/build/chooseSideCylinder";
import { SetHeightTo } from "../../../src/application/build/setHeightTo";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { contentsMenu } from "../../../src/domain/build/flow/menu";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, overworld } from "./fakes";

const playerId = asPlayerId("p");
const material = blockStateOf("minecraft:stone");
const component = fc.integer({ min: -100, max: 100 });
it("reads aim once at choice, ignores pitch, locks boxes and retains the axis on later height changes", () => {
  fc.assert(
    fc.property(
      fc.record({ x: component, y: component, z: component }),
      fc.boolean(),
      (direction, box) => {
        const repo = new FakeSessions();
        const feedback = new FakeFeedback();
        const session = repo.getOrCreate(playerId);
        session.setFlow({
          kind: "endpoint",
          from: { x: 0, y: 60, z: 0 },
          to: { x: 6, y: box ? 64 : 60, z: 8 },
          dimensionId: overworld,
          material,
        });
        let currentDirection = direction;
        const aim = {
          aim: vi.fn(() => ({
            ray: { origin: { x: 0, y: 0, z: 0 }, direction: currentDirection },
          })),
        };
        const choose = new ChooseSideCylinder(
          repo,
          feedback,
          aim,
          new ChooseHeighted(repo, feedback),
        );
        choose.execute({ playerId });
        const kind =
          Math.abs(direction.x) >= Math.abs(direction.z)
            ? "sideCylinderX"
            : "sideCylinderZ";
        expect(aim.aim).toHaveBeenCalledExactlyOnceWith(playerId);
        expect(session.flow).toMatchObject({
          kind: "heightStep",
          heightedKind: kind,
          heightLocked: box,
          previous: box ? 5 : 1,
        });
        currentDirection = { x: 1000, y: 0, z: 2000 };
        new SetHeightTo(repo).execute({ playerId, height: 7 });
        choose.execute({ playerId });
        expect(aim.aim).toHaveBeenCalledTimes(1);
        expect(session.flow).toMatchObject({
          heightedKind: kind,
          previous: box ? 5 : 7,
        });
        expect(contentsMenu(session.flow).map(({ id }) => id)).toEqual([
          "fill",
          "hollow",
          "tube",
          "cancel",
        ]);
      },
    ),
  );
});

it("falls back to x when aim is unavailable", () => {
  const repo = new FakeSessions();
  repo.getOrCreate(playerId).setFlow({
    kind: "endpoint",
    from: { x: 0, y: 60, z: 0 },
    to: { x: 4, y: 64, z: 4 },
    dimensionId: overworld,
    material,
  });
  const delegate = { execute: vi.fn() };
  new ChooseSideCylinder(
    repo,
    new FakeFeedback(),
    { aim: () => undefined },
    delegate,
  ).execute({ playerId });
  expect(delegate.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
    kind: "sideCylinderX",
  });
});

it("does not read aim or delegate for missing selections, lines or vertical rectangles", () => {
  const repo = new FakeSessions();
  const aim = { aim: vi.fn() };
  const delegate = { execute: vi.fn() };
  const choose = new ChooseSideCylinder(
    repo,
    new FakeFeedback(),
    aim,
    delegate,
  );
  choose.execute({ playerId });
  for (const to of [
    { x: 4, y: 60, z: 0 },
    { x: 4, y: 64, z: 0 },
  ]) {
    repo.getOrCreate(playerId).setFlow({
      kind: "endpoint",
      from: { x: 0, y: 60, z: 0 },
      to,
      dimensionId: overworld,
      material,
    });
    choose.execute({ playerId });
  }
  expect(aim.aim).not.toHaveBeenCalled();
  expect(delegate.execute).not.toHaveBeenCalled();
});

it.each([
  { x: 1, y: 100, z: -1 },
  { x: 0, y: -1, z: 0 },
])("chooses x for a horizontal tie with direction %j", (direction) => {
  const repo = new FakeSessions();
  repo.getOrCreate(playerId).setFlow({
    kind: "endpoint",
    from: { x: 0, y: 60, z: 0 },
    to: { x: 4, y: 64, z: 4 },
    dimensionId: overworld,
    material,
  });
  const delegate = { execute: vi.fn() };
  new ChooseSideCylinder(
    repo,
    new FakeFeedback(),
    { aim: () => ({ ray: { origin: { x: 0, y: 0, z: 0 }, direction } }) },
    delegate,
  ).execute({ playerId });
  expect(delegate.execute).toHaveBeenCalledExactlyOnceWith({
    playerId,
    kind: "sideCylinderX",
  });
});
