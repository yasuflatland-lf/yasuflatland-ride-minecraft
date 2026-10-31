import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
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
