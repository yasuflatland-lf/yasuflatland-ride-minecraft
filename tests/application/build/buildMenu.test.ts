import fc from "fast-check";
import { expect, it } from "vitest";
import { ChooseAdjustHeight } from "../../../src/application/build/chooseAdjustHeight";
import { CloseBuildMenu } from "../../../src/application/build/closeBuildMenu";
import { OpenBuildMenu } from "../../../src/application/build/openBuildMenu";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  confirmLiveHeight,
  setHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { selectionHeightLimit } from "../../../src/domain/build/selection";
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

it("adjusts an existing selection from its current height and confirms the new height", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 40 }),
      fc.integer({ min: 1, max: 40 }),
      (height, nextHeight) => {
        const repo = new FakeSessions();
        const session = repo.getOrCreate(playerId);
        const initial = confirmEndpointHeight(
          tapAir(
            tapBlock(
              session.flow,
              overworld,
              { x: 0, y: 60, z: 0 },
              blockStateOf("minecraft:stone"),
            ),
            { x: 2, y: 60 + height - 1, z: 3 },
          ),
        );
        if (initial.kind !== "selected") throw new Error("Expected selection");
        session.setFlow(initial);
        new ChooseAdjustHeight(repo).execute({ playerId });
        const flow = session.flow;
        if (flow.kind !== "baseHeight") throw new Error("Expected live height");
        expect(flow.selection).toEqual(initial.selection);
        expect(flow.baseBox.max.y).toBe(initial.selection.box.min.y);
        expect(flow.previous).toBe(
          Math.min(height, selectionHeightLimit(initial.selection.box)),
        );
        const changed = setHeight(flow, nextHeight);
        if (changed.kind !== "baseHeight")
          throw new Error("Expected live height");
        const confirmed = confirmLiveHeight(changed);
        expect(confirmed.selection.box.max.y).toBe(
          initial.selection.box.min.y + nextHeight - 1,
        );
        expect(confirmed.selection.material).toEqual(
          initial.selection.material,
        );
      },
    ),
  );
});
