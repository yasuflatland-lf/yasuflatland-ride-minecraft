import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { forward, leftOf, type Vec2 } from "../../../src/domain/shared/vec";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { Seating, type SeatLeaver } from "../../../src/domain/vehicle/seating";
import {
  occupiedSeats,
  type RiderPos,
} from "../../../src/domain/vehicle/seats";
import { defined } from "../../support/defined";

const P = SUV_PROFILE.seats.positions;
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const seat = fc.integer({ min: 0, max: 3 });
const backSeat = fc.integer({ min: 1, max: 3 });
const AT_REST: Vec2 = { x: 0, z: 0 };

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

const distinctSlots = fc
  .uniqueArray(fc.record({ id: fc.constantFrom("a", "b", "c", "d"), seat }), {
    selector: (r) => r.id,
    maxLength: 4,
  })
  .filter((list) => new Set(list.map((r) => r.seat)).size === list.length);

const anyRiders = specs(["a", "b", "c", "d", "e"], seat, 4);
const others = (at: fc.Arbitrary<number>) => specs(["a", "b", "c", "e"], at, 3);

// Same math as worldOffset in seats.test.ts, which shows that a rider at this
// offset reads as seat `i` for any heading.
function worldOffset(yawDeg: number, i: number, positions = P): Vec2 {
  const f = forward(yawDeg);
  const l = leftOf(f);
  const s = defined(positions[i], `seat ${i}`);
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

function place(list: readonly Spec[], yawDeg: number): RiderPos[] {
  return list.map((r) => ({
    id: asPlayerId(r.id),
    offset: worldOffset(yawDeg, r.seat),
  }));
}

describe("Seating (ADR 0019, ADR 0025)", () => {
  it("reports exactly the riders who left, each with the seat they had, ascending by seat", () => {
    fc.assert(
      fc.property(anyRiders, anyRiders, yaw, (prev, now, y) => {
        const f = forward(y);
        const before = place(prev, y);
        const after = place(now, y);
        const s = new Seating(P);
        s.update(before, f, AT_REST);
        const { left } = s.update(after, f, AT_REST);
        const departed = before.filter(
          (r) => !after.some((a) => a.id === r.id),
        );
        expect(new Set(left.map((l) => l.id))).toEqual(
          new Set(departed.map((r) => r.id)),
        );
        const expected: SeatLeaver[] = departed
          .flatMap((r) => {
            const probe = new Seating(P);
            probe.update(before, f, AT_REST);
            return probe
              .update(
                before.filter((a) => a.id !== r.id),
                f,
                AT_REST,
              )
              .left.map(({ seat }) => ({ id: r.id, seat }));
          })
          .sort((a, b) => a.seat - b.seat);
        expect(left).toEqual(expected);
        expect(left.map(({ seat }) => seat)).toEqual(
          left.map(({ seat }) => seat).sort((a, b) => a - b),
        );
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
            const out = s.update(place(list, y), f, AT_REST);
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
        const out = new Seating(P).update(riders, f, AT_REST);
        const expected = riders.find(
          (r) => occupiedSeats(riders, f, P).get(r.id) === 0,
        )?.id;
        expect(out.driver?.id).toBe(expected);
        expect(out.mounted).toBe(expected !== undefined);
      }),
    );
  });

  it("has no driver once the driver leaves and nobody sits in seat 0", () => {
    const first = others(backSeat)
      .filter((o) => new Set(o.map((r) => r.seat)).size === o.length)
      .map((o) => [...o, { id: "d", seat: 0 }]);
    fc.assert(
      fc.property(first, others(backSeat), yaw, (tick0, tick1, y) => {
        const f = forward(y);
        const s = new Seating(P);
        s.update(place(tick0, y), f, AT_REST);
        const out = s.update(place(tick1, y), f, AT_REST);
        expect(out.driver).toBeUndefined();
        expect(out.mounted).toBe(false);
        expect(out.left.map(({ seat }) => seat)).toContain(0);
        expect(s.driver).toBeUndefined();
      }),
    );
  });

  it("taken and occupied match the riders aboard", () => {
    fc.assert(
      fc.property(anyRiders, yaw, (list, y) => {
        const s = new Seating(P);
        s.update(place(list, y), forward(y), AT_REST);
        const byNumber = (a: number, b: number) => a - b;
        expect(s.taken().size).toBe(list.length);
        expect(
          [...s.taken()].sort(byNumber).every((i) => i >= 0 && i < P.length),
        ).toBe(true);
        expect(s.occupied).toBe(list.length > 0);
      }),
    );
  });

  it("reports every seated rider as boarded on the first update and nobody on a repeat", () => {
    fc.assert(
      fc.property(anyRiders, yaw, (list, y) => {
        const s = new Seating(P);
        const riders = place(list, y);
        const f = forward(y);
        const out = s.update(riders, f, AT_REST);
        expect(out.boarded).toEqual([...s.taken()].sort((a, b) => a - b));
        expect(s.update(riders, f, AT_REST).boarded).toEqual([]);
      }),
    );
  });

  it("restore seats the riders without reporting a new driver", () => {
    fc.assert(
      fc.property(anyRiders, yaw, (list, y) => {
        const f = forward(y);
        const riders = place(list, y);
        const s = Seating.restore(P, riders, f);
        const out = s.update(riders, f, AT_REST);
        expect(out.left.map(({ seat }) => seat)).toEqual([]);
        expect(out.mounted).toBe(false);
        expect(out.boarded).toEqual([]);
        expect(out.driver?.id).toBe(list.find((r) => r.seat === 0)?.id);
      }),
    );
  });
});

describe("Seating read by rider-list slot (ADR 0120)", () => {
  it("seats each rider by their slot wherever they stand, and the driver is exactly the rider in slot 0", () => {
    fc.assert(
      fc.property(
        distinctSlots,
        distinctSlots,
        fc.array(seat, { minLength: 5, maxLength: 5 }),
        yaw,
        (prev, now, stands, y) => {
          const f = forward(y);
          // A rider's position may lag anywhere, even at the driver's seat (stands).
          const laid = (list: readonly Spec[]) =>
            list.map((r, i) => ({
              id: asPlayerId(r.id),
              offset: worldOffset(y, stands[i] ?? 0),
              slot: r.seat,
            }));
          const s = new Seating(P);
          s.update(laid(prev), f, AT_REST);
          const out = s.update(laid(now), f, AT_REST);
          expect([...s.taken()].sort()).toEqual(
            [...new Set(now.map((r) => r.seat))].sort(),
          );
          expect(out.driver?.id).toBe(now.find((r) => r.seat === 0)?.id);
        },
      ),
    );
  });

  it("restores the riders by slot without reporting a new driver", () => {
    fc.assert(
      fc.property(distinctSlots, yaw, (list, y) => {
        const f = forward(y);
        const riders = list.map((r) => ({
          id: asPlayerId(r.id),
          offset: { x: 0, z: 0 },
          slot: r.seat,
        }));
        const s = Seating.restore(P, riders, f);
        const out = s.update(riders, f, AT_REST);
        expect(out.mounted).toBe(false);
        expect(out.boarded).toEqual([]);
        expect(out.driver?.id).toBe(list.find((r) => r.seat === 0)?.id);
      }),
    );
  });

  it("reports as boarded exactly the slots of riders who were not aboard, ascending", () => {
    fc.assert(
      fc.property(distinctSlots, distinctSlots, yaw, (prev, now, y) => {
        const laid = (list: readonly Spec[]) =>
          list.map((r) => ({
            id: asPlayerId(r.id),
            offset: { x: 0, z: 0 },
            slot: r.seat,
          }));
        const s = new Seating(P);
        const f = forward(y);
        s.update(laid(prev), f, AT_REST);
        const out = s.update(laid(now), f, AT_REST);
        expect(out.boarded).toEqual(
          now
            .filter((r) => !prev.some((p) => p.id === r.id))
            .map((r) => r.seat)
            .sort((a, b) => a - b),
        );
      }),
    );
  });
});

describe("Choosing a driver with position lag (ADR 0126)", () => {
  const passengers = fc.shuffledSubarray([1, 2, 3]);
  for (const profile of [SUV_PROFILE, CAMPER_PROFILE]) {
    const positions = profile.seats.positions;

    for (const { direction, maxLag } of [
      { direction: "forward", maxLag: 1.2 },
      { direction: "reverse", maxLag: 0.2 },
    ]) {
      it(`chooses the seat-0 rider with shared ${direction} lag (${profile.kind})`, () => {
        fc.assert(
          fc.property(
            yaw,
            fc.double({ min: 0, max: maxLag, noNaN: true }),
            passengers,
            (y, lag, seats) => {
              const f = forward(y);
              const distance = direction === "forward" ? lag : -lag;
              const step = { x: distance * f.x, z: distance * f.z };
              const riders = [...seats, 0].map((seat) => {
                const offset = worldOffset(y, seat, positions);
                return {
                  id: asPlayerId(seat === 0 ? "d" : `p${seat}`),
                  offset: { x: offset.x - step.x, z: offset.z - step.z },
                };
              });
              const out = new Seating(positions).update(riders, f, step);
              expect(out.driver?.id).toBe("d");
              expect(out.mounted).toBe(true);
            },
          ),
        );
      });
    }

    it(`matches raw seat-0 selection at rest (${profile.kind})`, () => {
      fc.assert(
        fc.property(anyRiders, yaw, (list, y) => {
          const f = forward(y);
          const riders = list.map((r) => ({
            id: asPlayerId(r.id),
            offset: worldOffset(y, r.seat, positions),
          }));
          const expected = riders.find(
            (r) => occupiedSeats(riders, f, positions).get(r.id) === 0,
          );
          const out = new Seating(positions).update(riders, f, AT_REST);
          expect(out.driver).toBe(expected);
        }),
      );
    });

    it(`leaves passengers without a driver at rest (${profile.kind})`, () => {
      fc.assert(
        fc.property(passengers, yaw, (seats, y) => {
          const riders = seats.map((seat) => ({
            id: asPlayerId(`p${seat}`),
            offset: worldOffset(y, seat, positions),
          }));
          const out = new Seating(positions).update(
            riders,
            forward(y),
            AT_REST,
          );
          expect(out.driver).toBeUndefined();
          expect(out.mounted).toBe(false);
        }),
      );
    });
  }

  it("chooses no driver for a layout without seats", () => {
    const riders = place([{ id: "d", seat: 0 }], 0);
    const out = new Seating([]).update(riders, forward(0), AT_REST);
    expect(out.driver).toBeUndefined();
    expect(out.mounted).toBe(false);
  });

  it("chooses the SUV driver when both front riders lag 0.575 blocks", () => {
    const f = forward(0);
    const lag = 0.575;
    const riders = place(
      [
        { id: "d", seat: 0 },
        { id: "q", seat: 1 },
      ],
      0,
    ).map((r) => ({
      ...r,
      offset: { x: r.offset.x - lag * f.x, z: r.offset.z - lag * f.z },
    }));
    const out = new Seating(P).update(riders, f, {
      x: lag * f.x,
      z: lag * f.z,
    });
    expect(out.driver?.id).toBe("d");
    expect(out.mounted).toBe(true);
  });
});

it("K5 keeps the lagged driver's seat taken and vacates the front seat", () => {
  const s = new Seating(P);
  const d = { id: asPlayerId("d"), offset: worldOffset(0, 0), slot: 0 };
  const p = { id: asPlayerId("p"), offset: worldOffset(0, 2), slot: 2 };
  s.update([d, p], forward(0), AT_REST);
  s.update([{ ...d, offset: worldOffset(0, 2) }, p], forward(0), AT_REST);
  expect(s.taken()).toEqual(new Set([0, 2]));
  expect(
    s.update([p], forward(0), AT_REST).left.map(({ seat }) => seat),
  ).toEqual([0]);
});

for (const profile of [SUV_PROFILE, CAMPER_PROFILE]) {
  const positions = profile.seats.positions;
  const coordinate = fc.double({ min: -5, max: 5, noNaN: true });
  const snapshot = fc
    .uniqueArray(
      fc.record({
        id: fc.constantFrom("a", "b", "c", "d", "e", "f"),
        offset: fc.record({ x: coordinate, z: coordinate }),
        slot: fc.option(fc.integer({ min: 0, max: 7 }), { nil: undefined }),
      }),
      { selector: (r) => r.id, maxLength: 6 },
    )
    .map((list) => list.map((r) => ({ ...r, id: asPlayerId(r.id) })));

  it(`settles arbitrary readings uniquely through a sequence (${profile.kind})`, () => {
    fc.assert(
      fc.property(
        fc.array(snapshot, { minLength: 1, maxLength: 12 }),
        yaw,
        (ticks, y) => {
          const f = forward(y);
          const seating = new Seating(positions);
          for (const [tick, riders] of ticks.entries()) {
            seating.update(riders, f, AT_REST);
            const settled = riders.flatMap((rider) => {
              const probe = new Seating(positions);
              for (const list of ticks.slice(0, tick + 1))
                probe.update(list, f, AT_REST);
              return probe
                .update(
                  riders.filter((r) => r.id !== rider.id),
                  f,
                  AT_REST,
                )
                .left.map(({ seat }) => seat);
            });
            expect(settled.length).toBe(
              Math.min(riders.length, positions.length),
            );
            expect(new Set(settled).size).toBe(settled.length);
            expect(seating.taken()).toEqual(new Set(settled));
            expect(
              settled.every((seat) => seat >= 0 && seat < positions.length),
            ).toBe(true);
          }
        },
      ),
    );
  });

  it(`keeps doors and the indexed driver stable under shared lag (${profile.kind})`, () => {
    const lag = fc.record({
      x: fc.double({ min: -1.5, max: 1.5, noNaN: true }),
      z: fc.double({ min: -1.5, max: 1.5, noNaN: true }),
    });
    const slots = fc.shuffledSubarray([0, 1, 2, 3]);
    fc.assert(
      fc.property(
        slots,
        slots,
        yaw,
        lag,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
        (aboard, leaving, y, l, lagTicks) => {
          const f = forward(y);
          const seating = new Seating(positions);
          const makeRiders = (list: readonly number[], lagged: boolean) =>
            list.map((slot) => {
              const at = worldOffset(y, slot, positions);
              return {
                id: asPlayerId(`r${slot}`),
                slot,
                offset: {
                  x: at.x + (lagged ? l.x : 0),
                  z: at.z + (lagged ? l.z : 0),
                },
              };
            });
          for (const [tick, lagged] of lagTicks.entries()) {
            const out = seating.update(makeRiders(aboard, lagged), f, AT_REST);
            expect(out.left.map(({ seat }) => seat)).toEqual([]);
            expect(out.driver?.id).toBe(aboard.includes(0) ? "r0" : undefined);
            expect(out.mounted).toBe(tick === 0 && aboard.includes(0));
            expect(seating.taken()).toEqual(new Set(aboard));
          }
          const remaining = aboard.filter((slot) => !leaving.includes(slot));
          const out = seating.update(makeRiders(remaining, true), f, AT_REST);
          expect(out.left.map(({ seat }) => seat)).toEqual(
            aboard
              .filter((slot) => leaving.includes(slot))
              .sort((a, b) => a - b),
          );
          expect(out.driver?.id).toBe(remaining.includes(0) ? "r0" : undefined);
          expect(out.mounted).toBe(false);
          const restored = Seating.restore(
            positions,
            makeRiders(remaining, true),
            f,
          );
          expect(restored.taken()).toEqual(new Set(remaining));
          expect(
            restored.update(makeRiders(remaining, false), f, AT_REST).mounted,
          ).toBe(false);
        },
      ),
    );
  });

  it(`reserves a matching previous seat for its position-only rider (${profile.kind})`, () => {
    fc.assert(
      fc.property(yaw, fc.integer({ min: 0, max: 3 }), (y, seat) => {
        const f = forward(y);
        const seating = new Seating(positions);
        const resident = {
          id: asPlayerId("resident"),
          offset: worldOffset(y, seat, positions),
        };
        const newcomer = {
          id: asPlayerId("newcomer"),
          offset: resident.offset,
        };
        seating.update([resident], f, AT_REST);
        seating.update([newcomer, resident], f, AT_REST);
        expect(seating.taken().size).toBe(2);
        expect(
          seating.update([newcomer], f, AT_REST).left.map(({ seat }) => seat),
        ).toEqual([seat]);
      }),
    );
  });
}
