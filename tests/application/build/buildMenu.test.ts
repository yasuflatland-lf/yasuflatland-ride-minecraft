import fc from "fast-check";
import { expect, it } from "vitest";
import { CloseBuildMenu } from "../../../src/application/build/closeBuildMenu";
import { OpenBuildMenu } from "../../../src/application/build/openBuildMenu";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/flow";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { confirmEndpointHeight } from "../../support/buildSelection";
import { FakeSessions, overworld } from "./fakes";

const playerId = asPlayerId("builder");

it("opens and closes the build menu before refreshing the preview without changing the selection", () => {
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), (x) => {
      const repo = new FakeSessions();
      const session = repo.getOrCreate(playerId);
      const endpoint = confirmEndpointHeight(
        tapAir(
          tapBlock(
            session.flow,
            overworld,
            { x, y: 60, z: 0 },
            blockStateOf("minecraft:stone"),
          ),
          { x: x + 3, y: 60, z: 4 },
        ),
      );
      session.setFlow(endpoint);
      const levels: unknown[] = [];
      const preview = {
        refresh(id: typeof playerId, tick: number) {
          expect(id).toBe(playerId);
          expect(tick).toBe(12);
          levels.push(
            session.flow.kind === "selected"
              ? session.flow.menuLevel
              : undefined,
          );
        },
      };
      new OpenBuildMenu(repo, preview).execute({ playerId, tick: 12 });
      expect(session.flow).toEqual({ ...endpoint, menuLevel: "build" });
      new CloseBuildMenu(repo, preview).execute({ playerId, tick: 12 });
      expect(session.flow).toEqual(endpoint);
      expect(levels).toEqual(["build", "root"]);
      expect(session.hasHistory).toBe(false);
      expect(session.clipboard).toBeUndefined();
    }),
  );
});

it("ignores missing sessions without creating one or refreshing a preview", () => {
  const repo = new FakeSessions();
  const preview = {
    refresh() {
      throw new Error("Unexpected preview");
    },
  };
  new OpenBuildMenu(repo, preview).execute({ playerId });
  new CloseBuildMenu(repo, preview).execute({ playerId });
  expect(repo.get(playerId)).toBeUndefined();
});
