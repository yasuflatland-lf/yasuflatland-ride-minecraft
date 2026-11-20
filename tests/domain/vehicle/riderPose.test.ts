import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { ticks } from "../../../src/domain/shared/ticks";
import {
  RiderPoseState,
  riderPoseOf,
} from "../../../src/domain/vehicle/riderPose";

const driverTable = {
  grip: "grip",
  lean: ["l3", "l2", "l1", "r1", "r2", "r3"],
};
const passengerTable = {
  grip: "passenger_grip",
  lean: ["p_l3", "p_l2", "p_l1", "p_r1", "p_r2", "p_r3"],
};
const table = { seats: [driverTable, passengerTable], refreshTicks: ticks(20) };
const riders = [
  { id: asPlayerId("driver"), slot: 0 },
  { id: asPlayerId("passenger"), slot: 1 },
];

it("sends both riders exactly once per pose change on non-refresh ticks", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: -10, max: 10 }), { minLength: 1 }),
      (levels) => {
        const state = new RiderPoseState();
        let previous: number | undefined;
        levels.forEach((level, index) => {
          const clamped = Math.max(-3, Math.min(3, level));
          expect(
            state.next(table, riders, level, index * table.refreshTicks + 1),
          ).toEqual(
            previous === clamped
              ? []
              : riders.map(({ id, slot }) => ({
                  type: "play",
                  playerId: id,
                  pose: riderPoseOf(
                    slot === 0 ? driverTable : passengerTable,
                    level,
                  ),
                })),
          );
          previous = clamped;
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
        {
          type: "play",
          playerId: passenger.id,
          pose: riderPoseOf(passengerTable, level),
        },
      ]);
      expect(state.next(table, [driver], level, 3)).toEqual([
        { type: "clear", playerId: passenger.id },
      ]);
      expect(state.next(table, [driver], level, 4)).toEqual([]);
      expect(state.next(table, [], level, 5)).toEqual([
        { type: "clear", playerId: driver.id },
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
      fc.integer({ min: 2, max: 40 }).map(ticks),
      (level, interval, refreshTicks) => {
        const table = { seats: [driverTable, passengerTable], refreshTicks };
        const state = new RiderPoseState();
        const expected = riders.map(({ id, slot }) => ({
          type: "play",
          playerId: id,
          pose: riderPoseOf(slot === 0 ? driverTable : passengerTable, level),
        }));
        state.next(table, riders, level, 1);
        expect(
          state.next(table, riders, level, interval * table.refreshTicks),
        ).toEqual(expected);
        expect(
          state.next(table, riders, level, interval * table.refreshTicks + 1),
        ).toEqual([]);
        state.resync();
        expect(
          state.next(table, riders, level, interval * table.refreshTicks + 1),
        ).toEqual(expected);
      },
    ),
  );
});
it("maps upright and mirrored levels and clamps beyond the table", () => {
  expect(riderPoseOf(driverTable, 0)).toBe(driverTable.grip);
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
      const level = Math.min(3, n);
      expect(riderPoseOf(driverTable, n)).toBe(`l${level}`);
      expect(riderPoseOf(driverTable, -n)).toBe(`r${level}`);
    }),
  );
});

it("uses each rider's slot even when rider order changes", () => {
  fc.assert(
    fc.property(fc.integer({ min: -10, max: 10 }), (level) => {
      const state = new RiderPoseState();
      const reversed = [...riders].reverse();
      expect(state.next(table, reversed, level, 1)).toEqual(
        reversed.map(({ id, slot }) => ({
          type: "play",
          playerId: id,
          pose: riderPoseOf(slot === 0 ? driverTable : passengerTable, level),
        })),
      );
      const swapped = riders.map((r) => ({ ...r, slot: 1 - r.slot }));
      expect(state.next(table, swapped, level, 2)).toEqual(
        swapped.map(({ id, slot }) => ({
          type: "play",
          playerId: id,
          pose: riderPoseOf(slot === 0 ? driverTable : passengerTable, level),
        })),
      );
      expect(state.next(table, swapped, level, 3)).toEqual([]);
    }),
  );
});
it("ignores a slot without a table and clears its previous pose once", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 100 }),
      fc.integer({ min: -3, max: 3 }),
      (slot, level) => {
        const state = new RiderPoseState();
        const rider = { id: asPlayerId("rider"), slot };
        expect(state.next(table, [rider], level, 1)).toEqual([]);
        state.next(table, [{ ...rider, slot: 0 }], level, 2);
        expect(state.next(table, [rider], level, 3)).toEqual([
          { type: "clear", playerId: rider.id },
        ]);
        expect(state.next(table, [rider], level, 4)).toEqual([]);
        expect(state.next(table, [rider], level, table.refreshTicks)).toEqual(
          [],
        );
        state.resync();
        expect(state.next(table, [rider], level, 21)).toEqual([]);
      },
    ),
  );
});
