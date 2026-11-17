import fc from "fast-check";
import { expect, it } from "vitest";
import { AimHeight } from "../../../src/application/build/aimHeight";
import { SetHeightTo } from "../../../src/application/build/setHeightTo";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  type BuildFlow,
  chooseHeighted,
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
        const set = new SetHeightTo(repo);
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
          chooseHeighted(endpoint, kind),
          { kind: "pasteAim" } as const,
        ]) {
          session.setFlow(flow);
          set.execute({ playerId, height });
          expect(session.flow).toEqual(
            flow.kind === "heightStep" ? { ...flow, previous: height } : flow,
          );
        }
        expect(other.flow).toBe(otherFlow);
      },
    ),
  );
});

it("keeps locked box heights and other players unchanged for aiming and explicit heights", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 40 }),
      fc.integer(),
      (height, requested) => {
        const repo = new FakeSessions();
        const playerId = asPlayerId("p");
        const other = repo.getOrCreate(asPlayerId("other"));
        const otherFlow = other.flow;
        const session = repo.getOrCreate(playerId);
        const flow = chooseHeighted(
          {
            kind: "endpoint",
            dimensionId: overworld,
            material: blockStateOf("minecraft:stone"),
            from: { x: 0, y: 60, z: 0 },
            to: { x: 4, y: 60 + height - 1, z: 5 },
          },
          "cylinder",
        );
        session.setFlow(flow);
        new SetHeightTo(repo).execute({ playerId, height: requested });
        expect(session.flow).toBe(flow);
        new AimHeight(repo).execute({
          playerId,
          ray: {
            origin: { x: -10, y: requested, z: 2 },
            direction: { x: 1, y: 0, z: 0 },
          },
        });
        expect(session.flow).toBe(flow);
        expect(other.flow).toBe(otherFlow);
      },
    ),
  );
});
