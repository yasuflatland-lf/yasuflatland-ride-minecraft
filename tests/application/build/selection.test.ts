import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { SetCorner } from "../../../src/application/build/setCorner";
import { ShowOutline } from "../../../src/application/build/showOutline";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
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

describe("SetCorner", () => {
  it("reports the inclusive volume once both corners are set in either order", () => {
    fc.assert(
      fc.property(cell, cell, fc.boolean(), (a, b, reverse) => {
        const { repo, feedback } = setup();
        const set = new SetCorner(repo, feedback);
        const first = reverse ? "pos2" : "pos1";
        const second = reverse ? "pos1" : "pos2";
        set.execute({
          playerId: alex,
          corner: first,
          dimensionId: overworld,
          cell: a,
        });
        set.execute({
          playerId: alex,
          corner: second,
          dimensionId: overworld,
          cell: b,
        });
        expect(repo.get(alex)?.selection).toEqual({
          dimensionId: overworld,
          [first]: a,
          [second]: b,
        });
        expect(feedback.messages).toEqual([
          { message: `${first}Set`, count: undefined },
          {
            message: `${second}Set`,
            count:
              (Math.abs(a.x - b.x) + 1) *
              (Math.abs(a.y - b.y) + 1) *
              (Math.abs(a.z - b.z) + 1),
          },
        ]);
      }),
    );
  });

  it("starts a new selection for a corner in another dimension", () => {
    const { repo, feedback } = setup();
    const set = new SetCorner(repo, feedback);
    set.execute({
      playerId: alex,
      corner: "pos1",
      dimensionId: overworld,
      cell: { x: 0, y: 0, z: 0 },
    });
    set.execute({
      playerId: alex,
      corner: "pos2",
      dimensionId: nether,
      cell: { x: 5, y: 5, z: 5 },
    });
    expect(feedback.messages[1]).toEqual({
      message: "pos2Set",
      count: undefined,
    });
    expect(repo.get(alex)?.selection?.pos1).toBeUndefined();
  });
});

describe("ClearSelection", () => {
  it("clears the selection", () => {
    const { repo, feedback } = setup();
    repo.getOrCreate(alex).setCorner("pos1", overworld, { x: 0, y: 0, z: 0 });
    new ClearSelection(repo, feedback).execute({ playerId: alex });
    expect(feedback.messages).toEqual([{ message: "selectionCleared" }]);
    expect(repo.get(alex)?.selection).toBeUndefined();
  });
});

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
  const corner = fc.constantFrom("pos1" as const, "pos2" as const);
  const intervalTick = fc
    .nat({ max: 1000 })
    .map((n) => n * BUILD_SPEC.outlineInterval);

  it("draws only the lone corner for its owner in the selection dimension", () => {
    fc.assert(
      fc.property(
        cell,
        dimension,
        corner,
        intervalTick,
        (at, dim, which, tick) => {
          const { repo, anchor, feedback } = setup();
          repo.getOrCreate(alex).setCorner(which, dim, at);
          enterBuildMode(new UpdateBuildModes(repo));
          new ShowOutline(repo, anchor, feedback).execute(tick);
          expect(feedback.corners).toEqual([
            { playerId: alex, dimensionId: dim, cell: at },
          ]);
          expect(feedback.outlines).toEqual([]);
        },
      ),
    );
  });

  it("draws only the selection outline when both corners exist", () => {
    fc.assert(
      fc.property(cell, cell, dimension, intervalTick, (a, b, dim, tick) => {
        const { repo, anchor, feedback } = setup();
        const session = repo.getOrCreate(alex);
        session.setCorner("pos1", dim, a);
        session.setCorner("pos2", dim, b);
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
        corner,
        fc.boolean(),
        intervalTick,
        (at, dim, which, active, tick) => {
          const { repo, anchor, feedback } = setup();
          const session = repo.getOrCreate(alex);
          if (active) enterBuildMode(new UpdateBuildModes(repo));
          else session.setCorner(which, dim, at);
          new ShowOutline(repo, anchor, feedback).execute(tick);
          expect(feedback.corners).toEqual([]);
          expect(feedback.outlines).toEqual([]);
        },
      ),
    );
  });

  it("draws nothing before setting a corner or after clearing it in build mode", () => {
    fc.assert(
      fc.property(
        cell,
        dimension,
        corner,
        intervalTick,
        (at, dim, which, tick) => {
          const { repo, anchor, feedback } = setup();
          enterBuildMode(new UpdateBuildModes(repo));
          const outline = new ShowOutline(repo, anchor, feedback);
          outline.execute(tick);
          expect(feedback.corners).toEqual([]);
          expect(feedback.outlines).toEqual([]);
          new SetCorner(repo, feedback).execute({
            playerId: alex,
            corner: which,
            dimensionId: dim,
            cell: at,
          });
          outline.execute(tick);
          expect(feedback.corners).toEqual([
            { playerId: alex, dimensionId: dim, cell: at },
          ]);
          feedback.corners.length = 0;
          new ClearSelection(repo, feedback).execute({ playerId: alex });
          outline.execute(tick);
          expect(feedback.corners).toEqual([]);
          expect(feedback.outlines).toEqual([]);
        },
      ),
    );
  });

  it("draws neither selection feedback off the outline interval", () => {
    fc.assert(
      fc.property(
        cell,
        cell,
        dimension,
        corner,
        fc.boolean(),
        intervalTick,
        fc.integer({ min: 1, max: BUILD_SPEC.outlineInterval - 1 }),
        (a, b, dim, which, both, tick, offset) => {
          const { repo, anchor, feedback } = setup();
          const session = repo.getOrCreate(alex);
          session.setCorner(which, dim, a);
          if (both)
            session.setCorner(which === "pos1" ? "pos2" : "pos1", dim, b);
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
    session.setCorner("pos1", overworld, { x: 0, y: 0, z: 0 });
    session.setCorner("pos2", overworld, { x: 2, y: 2, z: 2 });
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
