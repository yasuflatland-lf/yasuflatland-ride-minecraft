import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, leftOf, type Vec2 } from "../../../src/domain/shared/vec";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import {
  DRIVER_SEAT,
  nearestSeat,
  seatWorldPositions,
  toLocal,
} from "../../../src/domain/vehicle/seats";
import { defined } from "../../support/defined";

const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const seat = fc.integer({ min: 0, max: 3 });
const SEATS = SUV_PROFILE.seats.positions;

function worldOffset(yawDeg: number, i: number): Vec2 {
  const f = forward(yawDeg);
  const l = leftOf(f);
  const s = defined(SEATS[i], `seat ${i}`);
  return { x: l.x * s.x + f.x * s.z, z: l.z * s.x + f.z * s.z };
}

describe("seats (ADR 0019)", () => {
  it("seat 0 is front right (negative x = right, positive z = forward)", () => {
    expect(SEATS[0]).toEqual({ x: -0.463, z: -0.089 });
  });

  it("assigns an occupant at a seat position to that seat for any facing", () => {
    fc.assert(
      fc.property(yaw, seat, (y, i) => {
        expect(nearestSeat(toLocal(worldOffset(y, i), forward(y)), SEATS)).toBe(
          i,
        );
      }),
    );
  });

  it("assigns seats using a supplied layout for any facing", () => {
    const positions = fc.uniqueArray(
      fc.record({
        x: fc.integer({ min: -10, max: 10 }),
        z: fc.integer({ min: -10, max: 10 }),
      }),
      { minLength: 1, maxLength: 8, selector: (p) => `${p.x},${p.z}` },
    );
    fc.assert(
      fc.property(positions, yaw, (layout, heading) => {
        const f = forward(heading);
        const left = leftOf(f);
        for (const [i, position] of layout.entries()) {
          expect(nearestSeat(position, layout)).toBe(i);
          const offset = {
            x: left.x * position.x + f.x * position.z,
            z: left.z * position.x + f.z * position.z,
          };
          expect(nearestSeat(toLocal(offset, f), layout)).toBe(i);
        }
      }),
    );
  });

  it("breaks an exact tie on the centerline toward the lower seat index, the driver's side", () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), (z) => {
        expect([0, 2]).toContain(nearestSeat({ x: 0, z }, SEATS));
      }),
    );
    expect(nearestSeat({ x: 0, z: 0.075 }, SEATS)).toBe(0);
    expect(nearestSeat({ x: 0, z: -0.8 }, SEATS)).toBe(2);
  });
});

it("recovers every local seat from its world position at any hold pose", () => {
  const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
  fc.assert(
    fc.property(
      fc.record({ x: coordinate, y: coordinate, z: coordinate, yaw }),
      fc.array(fc.record({ x: coordinate, z: coordinate }), { maxLength: 8 }),
      (pose, positions) => {
        const world = seatWorldPositions(pose, positions);
        expect(world).toHaveLength(positions.length);
        for (const [index, point] of world.entries()) {
          const local = toLocal(
            { x: point.x - pose.x, z: point.z - pose.z },
            forward(pose.yaw),
          );
          expect(local.x).toBeCloseTo(defined(positions[index], "seat").x, 8);
          expect(local.z).toBeCloseTo(defined(positions[index], "seat").z, 8);
          expect(point.y).toBe(pose.y);
        }
      },
    ),
  );
});

it("keeps the driver's seat at index zero for every facing (ADR 0019)", () => {
  fc.assert(
    fc.property(yaw, (y) => {
      expect(DRIVER_SEAT).toBe(0);
      expect(
        nearestSeat(toLocal(worldOffset(y, DRIVER_SEAT), forward(y)), SEATS),
      ).toBe(DRIVER_SEAT);
    }),
  );
});
