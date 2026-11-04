import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { forward, leftOf, type Vec2 } from "../../../src/domain/shared/vec";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { Seating, type SeatLeaver } from "../../../src/domain/vehicle/seating";
import { defined } from "../../support/defined";
import { riderPos } from "../../support/riders";

const P = SUV_PROFILE.seats.positions;
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const seat = fc.integer({ min: 0, max: 3 });

function seatsOf(leavers: readonly SeatLeaver[]): number[] {
  return leavers.map(({ seat }) => seat);
}

interface Spec {
  id: string;
  seat: number;
}

const distinctSlots = fc
  .uniqueArray(fc.record({ id: fc.constantFrom("a", "b", "c", "d"), seat }), {
    selector: (r) => r.id,
    maxLength: 4,
  })
  .filter((list) => new Set(list.map((r) => r.seat)).size === list.length);

// Same math as worldOffset in seats.test.ts, which shows that a rider at this
// offset reads as seat `i` for any heading.
function worldOffset(yawDeg: number, i: number, positions = P): Vec2 {
  const f = forward(yawDeg);
  const l = leftOf(f);
  const s = defined(positions[i], `seat ${i}`);
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

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
            list.map((r, i) =>
              riderPos(r.id, {
                offset: worldOffset(y, stands[i] ?? 0),
                slot: r.seat,
              }),
            );
          const s = new Seating(P);
          s.update(laid(prev), f);
          const out = s.update(laid(now), f);
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
        const riders = list.map((r) =>
          riderPos(r.id, { offset: { x: 0, z: 0 }, slot: r.seat }),
        );
        const s = Seating.restore(P, riders, f);
        const out = s.update(riders, f);
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
          list.map((r) =>
            riderPos(r.id, { offset: { x: 0, z: 0 }, slot: r.seat }),
          );
        const s = new Seating(P);
        const f = forward(y);
        s.update(laid(prev), f);
        const out = s.update(laid(now), f);
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

it("K5 keeps the lagged driver's seat taken and vacates the front seat", () => {
  const s = new Seating(P);
  const d = riderPos("d", { offset: worldOffset(0, 0), slot: 0 });
  const p = riderPos("p", { offset: worldOffset(0, 2), slot: 2 });
  s.update([d, p], forward(0));
  s.update([{ ...d, offset: worldOffset(0, 2) }, p], forward(0));
  expect(s.taken()).toEqual(new Set([0, 2]));
  expect(seatsOf(s.update([p], forward(0)).left)).toEqual([0]);
});

for (const profile of [SUV_PROFILE, CAMPER_PROFILE]) {
  const positions = profile.seats.positions;
  const coordinate = fc.double({ min: -5, max: 5, noNaN: true });
  const snapshot = fc
    .uniqueArray(
      fc.record({
        id: fc.constantFrom("a", "b", "c", "d", "e", "f"),
        offset: fc.record({ x: coordinate, z: coordinate }),
        slot: fc.integer({ min: 0, max: 7 }),
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
            seating.update(riders, f);
            const settled = riders.flatMap((rider) => {
              const probe = new Seating(positions);
              for (const list of ticks.slice(0, tick + 1))
                probe.update(list, f);
              return seatsOf(
                probe.update(
                  riders.filter((r) => r.id !== rider.id),
                  f,
                ).left,
              );
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
              return riderPos(`r${slot}`, {
                slot,
                offset: {
                  x: at.x + (lagged ? l.x : 0),
                  z: at.z + (lagged ? l.z : 0),
                },
              });
            });
          for (const [tick, lagged] of lagTicks.entries()) {
            const out = seating.update(makeRiders(aboard, lagged), f);
            expect(out.left).toEqual([]);
            expect(out.driver?.id).toBe(aboard.includes(0) ? "r0" : undefined);
            expect(out.mounted).toBe(tick === 0 && aboard.includes(0));
            expect(seating.taken()).toEqual(new Set(aboard));
          }
          const remaining = aboard.filter((slot) => !leaving.includes(slot));
          const out = seating.update(makeRiders(remaining, true), f);
          expect(seatsOf(out.left)).toEqual(
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
          expect(restored.update(makeRiders(remaining, false), f).mounted).toBe(
            false,
          );
        },
      ),
    );
  });
}

it("falls back to the nearest seat for an out-of-range slot", () => {
  fc.assert(
    fc.property(
      seat,
      yaw,
      fc.integer({ min: P.length, max: 100 }),
      (at, y, slot) => {
        const rider = riderPos("r", { slot, offset: worldOffset(y, at) });
        const seating = new Seating(P);
        const out = seating.update([rider], forward(y));
        expect(seating.taken()).toEqual(new Set([at]));
        expect(out.driver?.id).toBe(at === 0 ? rider.id : undefined);
      },
    ),
  );
});
