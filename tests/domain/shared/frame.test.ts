import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LocalFrame,
  modelToLocal,
  seatWorldPoint,
} from "../../../src/domain/shared/frame";
import {
  hostLocalPx,
  hostSpotPoint,
} from "../../../src/domain/shared/tableTop";
import {
  degToRad,
  forward,
  leftOf,
  localOffset,
  localPoint,
  rightOf,
} from "../../../src/domain/shared/vec";

const coordinate = fc.oneof(
  fc.constantFrom(-0, 0, -Number.EPSILON, Number.EPSILON),
  fc.integer({ min: -16000, max: 16000 }).map((n) => n / 16),
  fc.double({ min: -1024, max: 1024, noNaN: true }),
);
const yaw = fc.oneof(
  fc.constantFrom(-180, -90, -0, 0, 90, 180, 270, 360),
  fc.integer({ min: -3600, max: 3600 }).map((n) => n / 10),
  fc.double({ min: -360, max: 360, noNaN: true }),
);
const world = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const local = fc.record({
  ahead: coordinate,
  left: coordinate,
  up: coordinate,
});

describe("LocalFrame", () => {
  it("round trips ahead, left, and up at any yaw", () => {
    fc.assert(
      fc.property(world, yaw, local, (origin, yaw, point) => {
        const frame = new LocalFrame(origin, yaw);
        const back = frame.toLocal(frame.toWorld(point));
        expect(back.ahead).toBeCloseTo(point.ahead, 10);
        expect(back.left).toBeCloseTo(point.left, 10);
        expect(back.up).toBeCloseTo(point.up, 10);
      }),
    );
  });

  it("keeps the addition order at a cell boundary and preserves signed zero", () => {
    const origin = { x: 1, y: 0, z: 0 };
    const frame = new LocalFrame(origin, 90);
    const point = { ahead: 1, left: -0.5, up: 0 };
    expect(Math.floor(frame.toWorld(point).x)).toBe(-1);
    expect(Math.floor(frame.toWorld(point, "left-first").x)).toBe(0);
    expect(Math.floor(origin.x + frame.toWorldOffset(point).x)).toBe(0);
    expect(
      new LocalFrame(origin, 0).toWorldOffset({ ahead: -0, left: -1, up: 0 }).z,
    ).toBe(-0);
  });

  it("preserves both translation orders and the untranslated offset bit for bit", () => {
    fc.assert(
      fc.property(world, yaw, local, (origin, yaw, point) => {
        const { ahead, left, up } = point;
        const f = forward(yaw);
        const l = leftOf(f);
        const frame = new LocalFrame(origin, yaw);
        expect(frame.toWorld(point)).toStrictEqual({
          ...localPoint(origin, f, ahead, -left),
          y: origin.y + up,
        });
        expect(frame.toWorld(point, "left-first")).toStrictEqual({
          x: origin.x + l.x * left + f.x * ahead,
          y: origin.y + up,
          z: origin.z + l.z * left + f.z * ahead,
        });
        expect(frame.toWorldOffset(point)).toStrictEqual({
          ...localOffset(f, ahead, -left),
          y: up,
        });
      }),
    );
  });

  it("preserves fractional placements on exact grid axes bit for bit", () => {
    fc.assert(
      fc.property(
        world,
        fc.constantFrom(0, 90, 180, 270),
        local,
        (origin, yaw, point) => {
          const f = forward(yaw);
          const ahead = { x: Math.round(f.x), z: Math.round(f.z) };
          const left = leftOf(ahead);
          const expected = {
            x: origin.x + ahead.x * point.ahead + left.x * point.left,
            y: origin.y + point.up,
            z: origin.z + ahead.z * point.ahead + left.z * point.left,
          };
          expect(LocalFrame.grid(origin, yaw).toWorld(point)).toStrictEqual(
            expected,
          );
        },
      ),
    );
  });

  it("uses model right and rear for seating offsets", () => {
    fc.assert(
      fc.property(world, yaw, world, (origin, yaw, seat) => {
        const f = forward(yaw);
        const r = rightOf(f);
        expect(modelToLocal(seat)).toStrictEqual({
          ahead: -seat.z,
          left: -seat.x,
          up: seat.y,
        });
        expect(seatWorldPoint(origin, yaw, seat)).toStrictEqual({
          x: origin.x + r.x * seat.x - f.x * seat.z,
          y: origin.y + seat.y,
          z: origin.z + r.z * seat.x - f.z * seat.z,
        });
      }),
    );
  });

  it("preserves tabletop pixel rotation, scaling, and translation", () => {
    fc.assert(
      fc.property(world, yaw, world, world, (at, yaw, spot, point) => {
        const host = { at, yaw };
        const c = Math.cos(degToRad(yaw));
        const s = Math.sin(degToRad(yaw));
        expect(hostSpotPoint(host, spot, spot.y)).toStrictEqual({
          x: at.x + (spot.x * c - spot.z * s) / 16,
          y: at.y + spot.y / 16,
          z: at.z + (spot.x * s + spot.z * c) / 16,
        });
        const dx = point.x - at.x;
        const dz = point.z - at.z;
        expect(hostLocalPx(host, point)).toStrictEqual({
          x: (dx * c + dz * s) * 16,
          z: (-dx * s + dz * c) * 16,
        });
      }),
    );
  });
});
