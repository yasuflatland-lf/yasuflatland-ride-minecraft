import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateSelection } from "../../../src/application/build/rotateSelection";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/flow";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("builder");
const from = { x: 4, y: 64, z: 0 };
const to = { x: 0, y: 65, z: 2 };
const span = boxOf(from, to);
const material = blockStateOf("minecraft:stone");

function setup(previous: number) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const flow = tapAir(tapBlock(session.flow, overworld, from, material), to);
  if (flow.kind !== "baseHeight") throw new Error("Expected baseHeight");
  session.setFlow({ ...flow, previous });
  const world = new FakeWorld();
  const structures = new FakeStructureStore(world);
  const feedback = new FakeFeedback();
  const core = new RotateBox(
    repo,
    world,
    new FakeBuildPlayers(),
    structures,
    feedback,
    { warn: vi.fn() },
  );
  return {
    session,
    structures,
    feedback,
    rotate: new RotateSelection(repo, core, feedback),
  };
}

it("rotates the tapped span for any live height", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 256 }), (previous) => {
      const { rotate, session, structures } = setup(previous);
      expect(rotate.execute({ playerId, dimensionId: overworld })).toBe(
        "rotated",
      );
      expect(structures.calls).toContainEqual({
        kind: "capture",
        box: span,
        dimensionId: overworld,
        ownerId: playerId,
        mode: "exact",
      });
      expect(session.flow).toMatchObject({
        kind: "selected",
        menuLevel: "root",
        from,
        to,
        selection: {
          box: planRotationAboutCenter(span).target,
          material,
          dimensionId: overworld,
        },
      });
    }),
  );
});

it("keeps the confirmed span selected when a busy edit refuses rotation", () => {
  const { rotate, session, feedback } = setup(7);
  session.beginEdit();
  expect(rotate.execute({ playerId, dimensionId: overworld })).toBe("refused");
  expect(feedback.messages.at(-1)?.message).toBe("busy");
  expect(session.flow).toMatchObject({
    kind: "selected",
    menuLevel: "root",
    from,
    to,
    selection: { box: span },
  });
});

it("reports no selection in another dimension and preserves live height", () => {
  const { rotate, session, structures, feedback } = setup(7);
  const before = session.flow;
  expect(rotate.execute({ playerId, dimensionId: nether })).toBe("noSelection");
  expect(feedback.messages.at(-1)?.message).toBe("noSelection");
  expect(session.flow).toBe(before);
  expect(structures.calls).toEqual([]);
});
