import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { ShowOutline } from "../../../src/application/build/showOutline";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import { tapBlock } from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  FakeAnchor,
  FakeFeedback,
  FakeSessions,
  nether,
  overworld,
} from "./fakes";

const alex = asPlayerId("alex");
const coordinate = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });

function setup() {
  const repo = new FakeSessions();
  const anchor = new FakeAnchor();
  const feedback = new FakeFeedback();
  return { repo, anchor, feedback };
}

function enterBuildMode(modes: UpdateBuildModes) {
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++) {
    modes.execute([{ playerId: alex, holding: true }]);
  }
}

describe("UpdateBuildModes", () => {
  it("turns on after the enter ticks and off after the leave ticks", () => {
    const { repo } = setup();
    const modes = new UpdateBuildModes(repo);
    for (let i = 0; i < BUILD_SPEC.modeEnterTicks - 1; i++) {
      modes.execute([{ playerId: alex, holding: true }]);
    }
    expect(modes.isInBuildMode(alex)).toBe(false);
    modes.execute([{ playerId: alex, holding: true }]);
    expect(modes.isInBuildMode(alex)).toBe(true);
    for (let i = 0; i < BUILD_SPEC.modeLeaveTicks; i++)
      modes.execute([{ playerId: alex, holding: false }]);
    expect(modes.isInBuildMode(alex)).toBe(false);
  });

  it("creates a session only for a player who holds the tool", () => {
    const { repo } = setup();
    const modes = new UpdateBuildModes(repo);
    modes.execute([{ playerId: alex, holding: false }]);
    expect(repo.get(alex)).toBeUndefined();
    expect(modes.isInBuildMode(asPlayerId("nobody"))).toBe(false);
  });
});

describe("ShowOutline", () => {
  const dimension = fc.constantFrom(overworld, nether);
  const intervalTick = fc
    .nat({ max: 1000 })
    .map((n) => n * BUILD_SPEC.outlineInterval);

  it("draws only the lone corner for its owner in the selection dimension", () => {
    fc.assert(
      fc.property(cell, dimension, intervalTick, (at, dim, tick) => {
        const { repo, anchor, feedback } = setup();
        repo
          .getOrCreate(alex)
          .setFlow(
            tapBlock(
              repo.getOrCreate(alex).flow,
              dim,
              at,
              blockStateOf("minecraft:stone"),
            ),
          );
        enterBuildMode(new UpdateBuildModes(repo));
        new ShowOutline(repo, anchor, feedback).execute(tick);
        expect(feedback.corners).toEqual([
          { playerId: alex, dimensionId: dim, cell: at },
        ]);
        expect(feedback.outlines).toEqual([]);
      }),
    );
  });

  it("draws only the selection outline when both corners exist", () => {
    fc.assert(
      fc.property(cell, cell, dimension, intervalTick, (a, b, dim, tick) => {
        const { repo, anchor, feedback } = setup();
        const session = repo.getOrCreate(alex);
        session.setFlow(
          tapBlock(session.flow, dim, a, blockStateOf("minecraft:stone")),
        );
        session.setFlow(
          tapBlock(session.flow, dim, b, blockStateOf("minecraft:stone")),
        );
        enterBuildMode(new UpdateBuildModes(repo));
        new ShowOutline(repo, anchor, feedback).execute(tick);
        expect(feedback.outlines).toEqual([
          { dimensionId: dim, box: boxOf(a, b), style: "selection" },
        ]);
        expect(feedback.corners).toEqual([]);
      }),
    );
  });

  it("draws neither selection feedback without a selection or outside build mode", () => {
    fc.assert(
      fc.property(
        cell,
        dimension,
        fc.boolean(),
        intervalTick,
        (at, dim, active, tick) => {
          const { repo, anchor, feedback } = setup();
          const session = repo.getOrCreate(alex);
          if (active) enterBuildMode(new UpdateBuildModes(repo));
          else
            session.setFlow(
              tapBlock(session.flow, dim, at, blockStateOf("minecraft:stone")),
            );
          new ShowOutline(repo, anchor, feedback).execute(tick);
          expect(feedback.corners).toEqual([]);
          expect(feedback.outlines).toEqual([]);
        },
      ),
    );
  });

  it("draws nothing before setting a corner or after clearing it in build mode", () => {
    fc.assert(
      fc.property(cell, dimension, intervalTick, (at, dim, tick) => {
        const { repo, anchor, feedback } = setup();
        enterBuildMode(new UpdateBuildModes(repo));
        const outline = new ShowOutline(repo, anchor, feedback);
        outline.execute(tick);
        expect(feedback.corners).toEqual([]);
        expect(feedback.outlines).toEqual([]);
        const session = repo.getOrCreate(alex);
        session.setFlow(
          tapBlock(session.flow, dim, at, blockStateOf("minecraft:stone")),
        );
        outline.execute(tick);
        expect(feedback.corners).toEqual([
          { playerId: alex, dimensionId: dim, cell: at },
        ]);
        feedback.corners.length = 0;
        new ClearSelection(repo, feedback).execute({ playerId: alex });
        outline.execute(tick);
        expect(feedback.corners).toEqual([]);
        expect(feedback.outlines).toEqual([]);
      }),
    );
  });

  it("draws neither selection feedback off the outline interval", () => {
    fc.assert(
      fc.property(
        cell,
        cell,
        dimension,
        fc.boolean(),
        intervalTick,
        fc.integer({ min: 1, max: BUILD_SPEC.outlineInterval - 1 }),
        (a, b, dim, both, tick, offset) => {
          const { repo, anchor, feedback } = setup();
          const session = repo.getOrCreate(alex);
          session.setFlow(
            tapBlock(session.flow, dim, a, blockStateOf("minecraft:stone")),
          );
          if (both)
            session.setFlow(
              tapBlock(session.flow, dim, b, blockStateOf("minecraft:stone")),
            );
          enterBuildMode(new UpdateBuildModes(repo));
          new ShowOutline(repo, anchor, feedback).execute(tick + offset);
          expect(feedback.corners).toEqual([]);
          expect(feedback.outlines).toEqual([]);
        },
      ),
    );
  });

  const prepare = () => {
    const { repo, anchor, feedback } = setup();
    const modes = new UpdateBuildModes(repo);
    const session = repo.getOrCreate(alex);
    session.setFlow(
      tapBlock(
        session.flow,
        overworld,
        { x: 0, y: 0, z: 0 },
        blockStateOf("minecraft:stone"),
      ),
    );
    session.setFlow(
      tapBlock(
        session.flow,
        overworld,
        { x: 2, y: 2, z: 2 },
        blockStateOf("minecraft:stone"),
      ),
    );
    session.setClipboard(
      clipboardOf(
        boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
        { x: 0, y: 0, z: 0 },
        () => blockStateOf("minecraft:stone"),
      ),
    );
    return {
      repo,
      anchor,
      feedback,
      modes,
      outline: new ShowOutline(repo, anchor, feedback),
    };
  };

  it("draws nothing off the interval or outside build mode", () => {
    const { feedback, modes, outline } = prepare();
    outline.execute(0);
    enterBuildMode(modes);
    outline.execute(BUILD_SPEC.outlineInterval + 1);
    expect(feedback.outlines).toEqual([]);
  });

  it("draws the selection and a paste outline that follows the feet", () => {
    const { anchor, feedback, modes, outline } = prepare();
    enterBuildMode(modes);
    anchor.feet = { dimensionId: nether, cell: { x: 10, y: 20, z: 30 } };
    outline.execute(BUILD_SPEC.outlineInterval);
    expect(feedback.outlines).toEqual([
      {
        dimensionId: overworld,
        box: boxOf({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }),
        style: "selection",
      },
      {
        dimensionId: nether,
        box: boxOf({ x: 10, y: 20, z: 30 }, { x: 11, y: 21, z: 31 }),
        style: "paste",
      },
    ]);
  });
});

it("does not draw the confirmed box after the flow returns to idle", () => {
  const { repo, anchor, feedback } = setup();
  const session = repo.getOrCreate(alex);
  session.confirmBox(
    overworld,
    boxOf({ x: 0, y: 64, z: 0 }, { x: 2, y: 66, z: 2 }),
  );
  enterBuildMode(new UpdateBuildModes(repo));
  new ShowOutline(repo, anchor, feedback).execute(BUILD_SPEC.outlineInterval);
  expect(feedback.outlines).toEqual([]);
  expect(feedback.corners).toEqual([]);
});

it("cancels only point1 when build mode leaves after its grace delay", () => {
  fc.assert(
    fc.property(cell, cell, fc.boolean(), (a, b, endpoint) => {
      const { repo } = setup();
      const modes = new UpdateBuildModes(repo, new CancelFlow(repo));
      enterBuildMode(modes);
      const session = repo.getOrCreate(alex);
      const material = blockStateOf("minecraft:stone");
      session.confirmBox(overworld, boxOf(a, b));
      session.setFlow(tapBlock(session.flow, overworld, a, material));
      if (endpoint)
        session.setFlow(tapBlock(session.flow, overworld, b, material));
      const flow = session.flow;
      const confirmed = session.confirmedBox;
      for (let i = 0; i < BUILD_SPEC.modeLeaveTicks - 1; i++)
        modes.execute([{ playerId: alex, holding: false }]);
      expect(session.flow).toBe(flow);
      modes.execute([{ playerId: alex, holding: false }]);
      expect(session.flow.kind).toBe(endpoint ? "endpoint" : "idle");
      expect(session.confirmedBox).toBe(confirmed);
    }),
  );
});
