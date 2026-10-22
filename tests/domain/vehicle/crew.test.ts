import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { forward } from "../../../src/domain/shared/vec";
import { Crew } from "../../../src/domain/vehicle/crew";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { Seating } from "../../../src/domain/vehicle/seating";
import { SPEC } from "../../../src/domain/vehicle/spec";

it("delegates seating and waits only within the driver handover window", () => {
  const riders = fc.uniqueArray(
    fc.record({
      id: fc.constantFrom("a", "b", "c", "d"),
      seat: fc.integer({ min: 0, max: 3 }),
      slot: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
    }),
    { selector: (r) => r.id, maxLength: 4 },
  );
  fc.assert(
    fc.property(
      fc.array(
        fc.record({ riders, yaw: fc.integer({ min: -180, max: 180 }) }),
        { maxLength: 30 },
      ),
      (ticks) => {
        const crew = new Crew(SUV_PROFILE);
        const seating = new Seating(SUV_PROFILE.seats.positions);
        let lastDriver = Number.NEGATIVE_INFINITY;
        for (const [tick, snapshot] of ticks.entries()) {
          const f = forward(snapshot.yaw);
          const list = snapshot.riders.map((r) => {
            const at = SUV_PROFILE.seats.positions[r.seat];
            if (!at) throw new Error("Missing seat");
            return {
              id: asPlayerId(r.id),
              slot: r.slot,
              offset: {
                x: f.z * at.x + f.x * at.z,
                z: -f.x * at.x + f.z * at.z,
              },
            };
          });
          const step = { x: 0, z: 0 };
          const expected = seating.update(list, f, step);
          const actual = crew.update(list, f, step);
          if (expected.driver) lastDriver = tick;
          expect(actual).toEqual({
            ...expected,
            awaitingDriver:
              !expected.driver &&
              list.length > 0 &&
              tick - lastDriver <= SPEC.driverHandoverTicks,
          });
          expect(crew.driver).toBe(seating.driver);
          expect(crew.occupied).toBe(seating.occupied);
          expect(crew.taken()).toEqual(seating.taken());
        }
      },
    ),
  );
});
