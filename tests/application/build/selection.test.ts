import { describe, expect, it } from "vitest";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions } from "./fakes";

const alex = asPlayerId("alex");
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
