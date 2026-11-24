import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { RotateBox } from "../../../src/application/build/rotateBox";
import { RotateSelection } from "../../../src/application/build/rotateSelection";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  adjustHeight,
  confirmLiveHeight,
  setHeight,
} from "../../../src/domain/build/flow/heightFlow";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import { tapAir, tapBlock } from "../../support/buildSelection";
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
  const world = new FakeWorld();
  const structures = new FakeStructureStore(world);
  const repo = new FakeSessions(structures);
  const session = repo.getOrCreate(playerId);
  const flow = tapAir(tapBlock(session.flow, overworld, from, material), to);
  if (flow.kind !== "baseHeight") throw new Error("Expected baseHeight");
  session.setFlow({ ...flow, previous });
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
    rotate: new RotateSelection(repo, core, feedback, world),
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
        from: planRotationAboutCenter(span).target.min,
        to: planRotationAboutCenter(span).target.max,
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

it("turns the current footprint and confirmed height when editing height again", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 3, max: 12 }),
      fc.boolean(),
      (height, turnFirst) => {
        const { session, rotate, structures } = setup(height);
        const flow = session.flow;
        if (flow.kind !== "baseHeight") throw new Error("Expected baseHeight");
        session.setFlow(confirmLiveHeight(flow));
        const cmd = { playerId, dimensionId: overworld };
        if (turnFirst) expect(rotate.execute(cmd)).toBe("rotated");
        const selected = session.flow;
        if (selected.kind !== "selected") throw new Error("Expected selected");
        const before = selected.selection.box;
        session.setFlow(setHeight(adjustHeight(selected, OVERWORLD_RANGE), 1));
        structures.calls.length = 0;
        expect(rotate.execute(cmd)).toBe("rotated");
        expect(structures.calls).toContainEqual({
          kind: "capture",
          box: before,
          dimensionId: overworld,
          ownerId: playerId,
          mode: "exact",
        });
        const target = planRotationAboutCenter(before).target;
        expect(session.flow).toMatchObject({
          selection: { box: target },
          from: { ...target.min, y: from.y },
          to: { ...target.max, y: to.y },
        });
      },
    ),
  );
});
