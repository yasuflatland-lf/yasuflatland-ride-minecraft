import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import {
  type HeldBuildItem,
  UpdateBuildModes,
} from "../../../src/application/build/updateBuildModes";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { tapBlock } from "../../../src/domain/build/flow/flow";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const alex = asPlayerId("alex");
const coordinate = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
function enterBuildMode(modes: UpdateBuildModes) {
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([{ playerId: alex, held: "wand" }]);
}
function setup() {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  return { repo, feedback };
}

describe("UpdateBuildModes", () => {
  it("turns on after the enter ticks and off after the leave ticks", () => {
    const { repo } = setup();
    const modes = new UpdateBuildModes(
      repo,
      new LeaveBuild(repo, new FakeStructureStore()),
    );
    for (let i = 0; i < BUILD_SPEC.modeEnterTicks - 1; i++) {
      modes.execute([{ playerId: alex, held: "wand" }]);
    }
    expect(modes.isInBuildMode(alex)).toBe(false);
    modes.execute([{ playerId: alex, held: "wand" }]);
    expect(modes.isInBuildMode(alex)).toBe(true);
    for (let i = 0; i < BUILD_SPEC.modeLeaveTicks; i++)
      modes.execute([{ playerId: alex, held: "none" }]);
    expect(modes.isInBuildMode(alex)).toBe(false);
  });

  it("treats paste controls exactly like holding no build item", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<HeldBuildItem>("wand", "none", "pasteControl"),
        ),
        (heldItems) => {
          const create = () => {
            const { repo } = setup();
            return {
              repo,
              modes: new UpdateBuildModes(
                repo,
                new LeaveBuild(repo, new FakeStructureStore()),
              ),
            };
          };
          const control = create();
          const baseline = create();
          const sequence: HeldBuildItem[] = [
            "pasteControl",
            ...Array<HeldBuildItem>(BUILD_SPEC.modeEnterTicks).fill("wand"),
            ...Array<HeldBuildItem>(BUILD_SPEC.modeLeaveTicks).fill(
              "pasteControl",
            ),
            ...heldItems,
          ];
          for (const held of sequence) {
            control.modes.execute([{ playerId: alex, held }]);
            baseline.modes.execute([
              { playerId: alex, held: held === "pasteControl" ? "none" : held },
            ]);
            expect(control.repo.get(alex)).toEqual(baseline.repo.get(alex));
            expect(control.modes.isInBuildMode(alex)).toBe(
              baseline.modes.isInBuildMode(alex),
            );
          }
        },
      ),
    );
  });

  it("creates a session only for a player who holds the tool", () => {
    const { repo } = setup();
    const modes = new UpdateBuildModes(
      repo,
      new LeaveBuild(repo, new FakeStructureStore()),
    );
    modes.execute([{ playerId: alex, held: "none" }]);
    expect(repo.get(alex)).toBeUndefined();
    expect(modes.isInBuildMode(asPlayerId("nobody"))).toBe(false);
  });
});
it("cancels in-progress selections when build mode leaves after its grace delay", () => {
  fc.assert(
    fc.property(cell, cell, fc.boolean(), (a, b, endpoint) => {
      const { repo } = setup();
      const modes = new UpdateBuildModes(
        repo,
        new LeaveBuild(repo, new FakeStructureStore()),
      );
      enterBuildMode(modes);
      const session = repo.getOrCreate(alex);
      const material = blockStateOf("minecraft:stone");
      session.confirmBox(selectionOf(overworld, boxOf(a, b), AIR));
      session.setFlow(tapBlock(session.flow, overworld, a, material));
      if (endpoint)
        session.setFlow(tapBlock(session.flow, overworld, b, material));
      const flow = session.flow;
      for (let i = 0; i < BUILD_SPEC.modeLeaveTicks - 1; i++)
        modes.execute([{ playerId: alex, held: "none" }]);
      expect(session.flow).toBe(flow);
      modes.execute([{ playerId: alex, held: "none" }]);
      expect(session.flow.kind).toBe("idle");
      expect(session.confirmedBox).toBeUndefined();
    }),
  );
});
