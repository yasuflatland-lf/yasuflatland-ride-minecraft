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
  FakeFeedback,
  FakeGate,
  FakeSessions,
  nether,
  overworld,
} from "./fakes";

const alex = asPlayerId("alex");

function setup() {
  const repo = new FakeSessions();
  const gate = new FakeGate();
  const feedback = new FakeFeedback();
  return { repo, gate, feedback };
}

function enterBuildMode(modes: UpdateBuildModes) {
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++) {
    modes.execute([{ playerId: alex, riding: true, holding: true }]);
  }
}

describe("SetCorner", () => {
  it("refuses outside a bulldozer and changes nothing", () => {
    const { repo, gate, feedback } = setup();
    gate.riding = false;
    new SetCorner(repo, gate, feedback).execute({
      playerId: alex,
      corner: "pos1",
      dimensionId: overworld,
      cell: { x: 1, y: 2, z: 3 },
    });
    expect(feedback.messages).toEqual([{ message: "notInBulldozer" }]);
    expect(repo.get(alex)).toBeUndefined();
  });

  it("reports the volume once both corners are set", () => {
    const { repo, gate, feedback } = setup();
    const set = new SetCorner(repo, gate, feedback);
    set.execute({
      playerId: alex,
      corner: "pos1",
      dimensionId: overworld,
      cell: { x: 0, y: 0, z: 0 },
    });
    set.execute({
      playerId: alex,
      corner: "pos2",
      dimensionId: overworld,
      cell: { x: 1, y: 2, z: 3 },
    });
    expect(feedback.messages).toEqual([
      { message: "pos1Set", count: undefined },
      { message: "pos2Set", count: 24 },
    ]);
  });

  it("starts a new selection for a corner in another dimension", () => {
    const { repo, gate, feedback } = setup();
    const set = new SetCorner(repo, gate, feedback);
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
  it("refuses outside a bulldozer and keeps the selection", () => {
    const { repo, gate, feedback } = setup();
    repo.getOrCreate(alex).setCorner("pos1", overworld, { x: 0, y: 0, z: 0 });
    gate.riding = false;
    new ClearSelection(repo, gate, feedback).execute({ playerId: alex });
    expect(feedback.messages).toEqual([{ message: "notInBulldozer" }]);
    expect(repo.get(alex)?.selection).toBeDefined();
  });

  it("clears the selection", () => {
    const { repo, gate, feedback } = setup();
    repo.getOrCreate(alex).setCorner("pos1", overworld, { x: 0, y: 0, z: 0 });
    new ClearSelection(repo, gate, feedback).execute({ playerId: alex });
    expect(feedback.messages).toEqual([{ message: "selectionCleared" }]);
    expect(repo.get(alex)?.selection).toBeUndefined();
  });
});

describe("UpdateBuildModes", () => {
  it("turns on after the enter ticks and off at once on getting off", () => {
    const { repo } = setup();
    const modes = new UpdateBuildModes(repo);
    for (let i = 0; i < BUILD_SPEC.modeEnterTicks - 1; i++) {
      modes.execute([{ playerId: alex, riding: true, holding: true }]);
    }
    expect(modes.isInBuildMode(alex)).toBe(false);
    modes.execute([{ playerId: alex, riding: true, holding: true }]);
    expect(modes.isInBuildMode(alex)).toBe(true);
    modes.execute([{ playerId: alex, riding: false, holding: true }]);
    expect(modes.isInBuildMode(alex)).toBe(false);
  });

  it("creates a session only for a player who holds the tool", () => {
    const { repo } = setup();
    const modes = new UpdateBuildModes(repo);
    modes.execute([{ playerId: alex, riding: true, holding: false }]);
    expect(repo.get(alex)).toBeUndefined();
    expect(modes.isInBuildMode(asPlayerId("nobody"))).toBe(false);
  });
});

describe("ShowOutline", () => {
  const prepare = () => {
    const { repo, gate, feedback } = setup();
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
      gate,
      feedback,
      modes,
      outline: new ShowOutline(repo, gate, feedback),
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
    const { gate, feedback, modes, outline } = prepare();
    enterBuildMode(modes);
    gate.feet = { dimensionId: nether, cell: { x: 10, y: 20, z: 30 } };
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
