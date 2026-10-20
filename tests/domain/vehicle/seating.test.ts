import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, leftOf, type Vec2 } from "../../../src/domain/shared/vec";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { Seating } from "../../../src/domain/vehicle/seating";
import {
  occupiedSeats,
  type RiderPos,
  vacatedSeats,
} from "../../../src/domain/vehicle/seats";
import { defined } from "../../support/defined";

const P = SUV_PROFILE.seats.positions;
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const seat = fc.integer({ min: 0, max: 3 });
const backSeat = fc.integer({ min: 1, max: 3 });

interface Spec {
  id: string;
  seat: number;
}

/** Up to `max` riders with distinct ids from `ids`, each at a seat from `at`. */
function specs(
  ids: readonly string[],
  at: fc.Arbitrary<number>,
  max: number,
): fc.Arbitrary<Spec[]> {
  return fc.uniqueArray(fc.record({ id: fc.constantFrom(...ids), seat: at }), {
    selector: (r) => r.id,
    maxLength: max,
  });
}

const anyRiders = specs(["a", "b", "c", "d", "e"], seat, 4);
const others = (at: fc.Arbitrary<number>) => specs(["a", "b", "c", "e"], at, 3);

// Same math as worldOffset in seats.test.ts, which shows that a rider at this
// offset reads as seat `i` for any heading.
function worldOffset(yawDeg: number, i: number): Vec2 {
  const f = forward(yawDeg);
  const l = leftOf(f);
  const s = defined(P[i], `seat ${i}`);
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

function place(list: readonly Spec[], yawDeg: number): RiderPos[] {
  return list.map((r) => ({ id: r.id, offset: worldOffset(yawDeg, r.seat) }));
}

describe("Seating (ADR 0019, ADR 0025)", () => {
  it("reports as vacated exactly the seats of riders who left, ascending", () => {
    fc.assert(
      fc.property(anyRiders, anyRiders, yaw, (prev, now, y) => {
        const f = forward(y);
        const before = place(prev, y);
        const after = place(now, y);
        const s = new Seating(P);
        s.update(before, f);
        const { vacated } = s.update(after, f);
        expect(vacated).toEqual(
          vacatedSeats(
            occupiedSeats(before, f, P),
            occupiedSeats(after, f, P),
          ).sort((a, b) => a - b),
        );
        expect([...vacated]).toEqual([...vacated].sort((a, b) => a - b));
      }),
    );
  });

  it("keeps the driver while they ride, wherever they read", () => {
    const first = others(backSeat).map((o) => [...o, { id: "d", seat: 0 }]);
    const later = fc
      .tuple(others(seat), seat)
      .map(([o, d]) => [...o, { id: "d", seat: d }]);
    fc.assert(
      fc.property(
        first,
        fc.array(later, { minLength: 1, maxLength: 10 }),
        yaw,
        (tick0, rest, y) => {
          const f = forward(y);
          const s = new Seating(P);
          for (const [i, list] of [tick0, ...rest].entries()) {
            const out = s.update(place(list, y), f);
            expect(out.driver?.id).toBe("d");
            expect(out.mounted).toBe(i === 0);
            expect(s.driver).toBe("d");
          }
        },
      ),
    );
  });

  it("picks the rider in seat 0 when there is no driver", () => {
    fc.assert(
      fc.property(anyRiders, yaw, (list, y) => {
        const f = forward(y);
        const riders = place(list, y);
        const out = new Seating(P).update(riders, f);
        const expected = riders.find(
          (r) => occupiedSeats(riders, f, P).get(r.id) === 0,
        )?.id;
        expect(out.driver?.id).toBe(expected);
        expect(out.mounted).toBe(expected !== undefined);
      }),
    );
  });

  it("has no driver once the driver leaves and nobody sits in seat 0", () => {
    const first = others(backSeat).map((o) => [...o, { id: "d", seat: 0 }]);
    fc.assert(
      fc.property(first, others(backSeat), yaw, (tick0, tick1, y) => {
        const f = forward(y);
        const s = new Seating(P);
        s.update(place(tick0, y), f);
        const out = s.update(place(tick1, y), f);
        expect(out.driver).toBeUndefined();
        expect(out.mounted).toBe(false);
        expect(out.vacated).toContain(0);
        expect(s.driver).toBeUndefined();
      }),
    );
  });

  it("taken and occupied match the riders aboard", () => {
    fc.assert(
      fc.property(anyRiders, yaw, (list, y) => {
        const s = new Seating(P);
        s.update(place(list, y), forward(y));
        const byNumber = (a: number, b: number) => a - b;
        expect([...s.taken()].sort(byNumber)).toEqual(
          [...new Set(list.map((r) => r.seat))].sort(byNumber),
        );
        expect(s.occupied).toBe(list.length > 0);
      }),
    );
  });

  it("restore seats the riders without reporting a new driver", () => {
    fc.assert(
      fc.property(anyRiders, yaw, (list, y) => {
        const f = forward(y);
        const riders = place(list, y);
        const s = Seating.restore(P, riders, f);
        const out = s.update(riders, f);
        expect(out.vacated).toEqual([]);
        expect(out.mounted).toBe(false);
        expect(out.driver?.id).toBe(list.find((r) => r.seat === 0)?.id);
      }),
    );
  });
});
