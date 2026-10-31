import fc from "fast-check";
import { expect, it } from "vitest";
import { SetRoofHeightTo } from "../../../src/application/build/setRoofHeightTo";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  type BuildFlow,
  chooseRoof,
} from "../../../src/domain/build/flow/flow";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeSessions, overworld } from "./fakes";

it("sets only a roof flow's height and leaves other players and missing sessions alone", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 15 }),
      fc.constantFrom("gable" as const, "hip" as const),
      (height, kind) => {
        const repo = new FakeSessions();
        const playerId = asPlayerId("p");
        const other = repo.getOrCreate(asPlayerId("other"));
        const otherFlow = other.flow;
        const set = new SetRoofHeightTo(repo);
        set.execute({ playerId, height });
        expect(repo.get(playerId)).toBeUndefined();
        const session = repo.getOrCreate(playerId);
        const endpoint: BuildFlow = {
          kind: "endpoint",
          dimensionId: overworld,
          from: { x: 0, y: 60, z: 0 },
          to: { x: 3, y: 60, z: 4 },
          material: blockStateOf("minecraft:stone"),
        };
        for (const flow of [
          { kind: "idle" } as const,
          endpoint,
          chooseRoof(endpoint, kind),
          { kind: "pasteAim", skipAir: false } as const,
        ]) {
          session.setFlow(flow);
          set.execute({ playerId, height });
          expect(session.flow).toEqual(
            flow.kind === "roofHeight" ? { ...flow, previous: height } : flow,
          );
        }
        expect(other.flow).toBe(otherFlow);
      },
    ),
  );
});
