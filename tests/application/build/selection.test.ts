import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import { tapBlock } from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, overworld } from "./fakes";

const alex = asPlayerId("alex");
const coordinate = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
function enterBuildMode(modes: UpdateBuildModes) {
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([{ playerId: alex, holding: true }]);
}
function setup() {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  return { repo, feedback };
}

describe("UpdateBuildModes", () => {
  it("turns on after the enter ticks and off after the leave ticks", () => {
    const { repo } = setup();
    const modes = new UpdateBuildModes(repo, new LeaveBuild(repo));
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
    const modes = new UpdateBuildModes(repo, new LeaveBuild(repo));
    modes.execute([{ playerId: alex, holding: false }]);
    expect(repo.get(alex)).toBeUndefined();
    expect(modes.isInBuildMode(asPlayerId("nobody"))).toBe(false);
  });
});
it("cancels in-progress selections when build mode leaves after its grace delay", () => {
  fc.assert(
    fc.property(cell, cell, fc.boolean(), (a, b, endpoint) => {
      const { repo } = setup();
      const modes = new UpdateBuildModes(repo, new LeaveBuild(repo));
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
      expect(session.flow.kind).toBe("idle");
      expect(session.confirmedBox).toBe(confirmed);
    }),
  );
});

it("does not call LeaveBuild when build mode turns off with idle flow and a held clipboard", () => {
  const { repo } = setup();
  const leave = new LeaveBuild(repo);
  const execute = vi.spyOn(leave, "execute");
  const modes = new UpdateBuildModes(repo, leave);
  enterBuildMode(modes);
  const session = repo.getOrCreate(alex);
  const cell = { x: 0, y: 0, z: 0 };
  const box = boxOf(cell, cell);
  const clipboard = clipboardOf(box, () => blockStateOf("minecraft:stone"));
  session.completeCopy(overworld, box, clipboard);
  for (let i = 0; i < BUILD_SPEC.modeLeaveTicks; i++)
    modes.execute([{ playerId: alex, holding: false }]);
  expect(modes.isInBuildMode(alex)).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  expect(session.clipboard).toBe(clipboard);
});
