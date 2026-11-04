import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FoldRoofTent } from "../../../src/application/camp/foldRoofTent";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import { FakeRoofTentWorld, PLAYER } from "./fakeRoofTentWorld";

const { hitsToFoldUp: hits, hitResetTicks: window } = ROOF_TENT_SPEC;

describe("FoldRoofTent", () => {
  it("requires the configured consecutive hits and returns before removing", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100000 }),
        fc.array(fc.integer({ min: 0, max: window }), {
          minLength: hits,
          maxLength: hits,
        }),
        fc.boolean(),
        (start, gaps, withPlayer) => {
          const world = new FakeRoofTentWorld();
          const fold = new FoldRoofTent(world);
          let tick = start;
          gaps.forEach((gap, index) => {
            tick += gap;
            const cmd = {
              tentId: asRoofTentId("tent"),
              tick,
              ...(withPlayer ? { playerId: PLAYER } : {}),
            };
            expect(fold.execute(cmd)).toBe(index === hits - 1);
            if (index < hits - 1 && withPlayer)
              expect(world.showMessage).toHaveBeenLastCalledWith(
                PLAYER,
                `hits_left:${hits - index - 1}`,
              );
          });
          expect(world.calls).toEqual([
            `return:tent:${withPlayer ? PLAYER : "drop"}`,
            "remove:tent",
          ]);
          expect(world.showMessage).toHaveBeenCalledTimes(
            withPlayer ? hits - 1 : 0,
          );
        },
      ),
    );
  });

  it("resets after a stale gap and keeps counters separate by tent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: window + 1, max: window + 10000 }),
        (gap) => {
          const world = new FakeRoofTentWorld();
          const fold = new FoldRoofTent(world);
          for (let i = 0; i < hits - 1; i++)
            expect(
              fold.execute({ tentId: asRoofTentId("tent"), tick: 0 }),
            ).toBe(false);
          expect(fold.execute({ tentId: asRoofTentId("other"), tick: 0 })).toBe(
            false,
          );
          for (let i = 0; i < hits; i++)
            expect(
              fold.execute({ tentId: asRoofTentId("tent"), tick: gap }),
            ).toBe(i === hits - 1);
          expect(world.remove).toHaveBeenCalledExactlyOnceWith("tent");
        },
      ),
    );
  });
});
