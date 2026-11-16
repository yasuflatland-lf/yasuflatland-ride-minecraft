import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  RiderPoseState,
  riderPoseOf,
} from "../../../src/domain/vehicle/riderPose";

const table = {
  grip: "grip",
  lean: ["l3", "l2", "l1", "r1", "r2", "r3"],
  refreshTicks: 20,
};
const riders = [asPlayerId("driver"), asPlayerId("passenger")];

it("sends both riders exactly once per pose change on non-refresh ticks", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: -10, max: 10 }), { minLength: 1 }),
      (levels) => {
        const state = new RiderPoseState();
        let previous: string | undefined;
        levels.forEach((level, index) => {
          const pose = riderPoseOf(table, level);
          expect(
            state.next(table, riders, level, index * table.refreshTicks + 1),
          ).toEqual(
            previous === pose
              ? []
              : riders.map((playerId) => ({ type: "play", playerId, pose })),
          );
          previous = pose;
        });
      },
    ),
  );
});
it("clears each departing rider once and handles a newly arriving rider independently", () => {
  fc.assert(
    fc.property(fc.integer({ min: -3, max: 3 }), (level) => {
      const state = new RiderPoseState();
      const [driver, passenger] = riders;
      if (!driver || !passenger) throw new Error("two riders required");
      state.next(table, [driver], level, 1);
      expect(state.next(table, riders, level, 2)).toEqual([
        { type: "play", playerId: passenger, pose: riderPoseOf(table, level) },
      ]);
      expect(state.next(table, [driver], level, 3)).toEqual([
        { type: "clear", playerId: passenger },
      ]);
      expect(state.next(table, [driver], level, 4)).toEqual([]);
      expect(state.next(table, [], level, 5)).toEqual([
        { type: "clear", playerId: driver },
      ]);
      expect(state.next(table, [], level, 6)).toEqual([]);
    }),
  );
});
it("refreshes every rider and resync re-sends every pose", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -3, max: 3 }),
      fc.integer({ min: 1, max: 100 }),
      (level, interval) => {
        const state = new RiderPoseState();
        const expected = riders.map((playerId) => ({
          type: "play",
          playerId,
          pose: riderPoseOf(table, level),
        }));
        state.next(table, riders, level, 1);
        expect(
          state.next(table, riders, level, interval * table.refreshTicks),
        ).toEqual(expected);
        state.resync();
        expect(state.next(table, riders, level, 3)).toEqual(expected);
      },
    ),
  );
});
it("maps upright and mirrored levels and clamps beyond the table", () => {
  expect(riderPoseOf(table, 0)).toBe(table.grip);
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
      const level = Math.min(3, n);
      expect(riderPoseOf(table, n)).toBe(`l${level}`);
      expect(riderPoseOf(table, -n)).toBe(`r${level}`);
    }),
  );
});
