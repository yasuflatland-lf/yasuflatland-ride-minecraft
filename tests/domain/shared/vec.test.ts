import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  approach,
  clampLength,
  degToRad,
  dot,
  forward,
  leftOf,
  length,
  localOffset,
  localPoint,
  normalizeYaw,
  rightOf,
} from "../../../src/domain/shared/vec";
import { toLocal } from "../../../src/domain/vehicle/seats";

const yaw = fc.double({ min: -720, max: 720, noNaN: true });
const reach = fc.double({ min: -20, max: 20, noNaN: true });
const coord = fc.double({ min: -3e7, max: 3e7, noNaN: true });
const point = fc.record({ x: coord, z: coord });
const unit = yaw.map(forward);

describe("vec", () => {
  it("yaw 0 points toward +z (south), and yaw -90 points toward +x (east)", () => {
    expect(forward(0).x).toBeCloseTo(0);
    expect(forward(0).z).toBeCloseTo(1);
    expect(forward(-90).x).toBeCloseTo(1);
    expect(forward(-90).z).toBeCloseTo(0);
  });

  it("when facing south, right is west (-x) and left is east (+x)", () => {
    expect(rightOf(forward(0)).x).toBeCloseTo(-1);
    expect(leftOf(forward(0)).x).toBeCloseTo(1);
  });

  it("forward is a unit vector perpendicular to rightOf", () => {
    fc.assert(
      fc.property(yaw, (y) => {
        const f = forward(y);
        expect(length(f)).toBeCloseTo(1, 9);
        expect(dot(f, rightOf(f))).toBeCloseTo(0, 9);
      }),
    );
  });

  it("clampLength stays within the upper limit and preserves direction", () => {
    const v = fc.record({
      x: fc.double({ min: -5, max: 5, noNaN: true }),
      z: fc.double({ min: -5, max: 5, noNaN: true }),
    });
    fc.assert(
      fc.property(
        v,
        fc.double({ min: 0.01, max: 2, noNaN: true }),
        (a, max) => {
          const c = clampLength(a, max);
          expect(length(c)).toBeLessThanOrEqual(max + 1e-9);
          expect(a.x * c.z - a.z * c.x).toBeCloseTo(0, 9);
        },
      ),
    );
  });

  it("normalizeYaw keeps yaw within (-180, 180] and preserves direction", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e5, max: 1e5, noNaN: true }), (y) => {
        const n = normalizeYaw(y);
        expect(n).toBeGreaterThan(-180);
        expect(n).toBeLessThanOrEqual(180);
        expect(forward(n).x).toBeCloseTo(forward(y).x, 6);
        expect(forward(n).z).toBeCloseTo(forward(y).z, 6);
      }),
    );
  });

  it("left is the exact opposite of right for every heading", () => {
    fc.assert(
      // Whole degrees off the half turns: the double `yaw` arbitrary leans on
      // 0 and ±720, where sin(yaw) is 0 and a wrong sign on z goes unseen.
      fc.property(
        fc.integer({ min: -719, max: 719 }).filter((d) => d % 180 !== 0),
        (y) => {
          const f = forward(y);
          const left = leftOf(f);
          const right = rightOf(f);
          expect(left.x).toBeCloseTo(-right.x, 9);
          expect(left.z).toBeCloseTo(-right.z, 9);
        },
      ),
    );
  });

  it("normalizeYaw maps every half turn to 180, never -180", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (turns) => {
        expect(normalizeYaw(180 + 360 * turns)).toBe(180);
      }),
    );
  });

  it("localOffset matches the inline right-handed offset bit for bit", () => {
    fc.assert(
      fc.property(unit, reach, reach, (f, a, s) => {
        const r = rightOf(f);
        const o = localOffset(f, a, s);
        expect(o.x + 0).toBe(f.x * a + r.x * s + 0);
        expect(o.z + 0).toBe(f.z * a + r.z * s + 0);
      }),
    );
  });

  it("localPoint matches the inline origin-first sum bit for bit", () => {
    fc.assert(
      fc.property(point, unit, reach, reach, (o, f, a, s) => {
        const r = rightOf(f);
        const p = localPoint(o, f, a, s);
        expect(p.x + 0).toBe(o.x + f.x * a + r.x * s + 0);
        expect(p.z + 0).toBe(o.z + f.z * a + r.z * s + 0);
      }),
    );
  });

  it("localPoint with a negated seat x matches the old left-handed seat sum bit for bit", () => {
    fc.assert(
      fc.property(point, unit, reach, reach, (o, f, a, s) => {
        const l = leftOf(f);
        const p = localPoint(o, f, a, -s);
        expect(p.x + 0).toBe(o.x + f.x * a + l.x * s + 0);
        expect(p.z + 0).toBe(o.z + f.z * a + l.z * s + 0);
      }),
    );
  });

  it("localOffset with no sideways part scales the facing", () => {
    fc.assert(
      fc.property(unit, reach, (f, a) => {
        const o = localOffset(f, a, 0);
        expect(o.x + 0).toBe(f.x * a + 0);
        expect(o.z + 0).toBe(f.z * a + 0);
      }),
    );
  });

  it("toLocal undoes localOffset with seat x on the left", () => {
    fc.assert(
      fc.property(unit, reach, reach, (f, a, s) => {
        const back = toLocal(localOffset(f, a, s), f);
        expect(back.x).toBeCloseTo(-s, 9);
        expect(back.z).toBeCloseTo(a, 9);
      }),
    );
  });

  it("facing south, one block to the right is west", () => {
    const o = localOffset(forward(0), 0, 1);
    expect(o.x).toBeCloseTo(-1);
    expect(o.z).toBeCloseTo(0);
  });
});

describe("approach", () => {
  const n = fc.double({ min: -1000, max: 1000, noNaN: true });
  const step = fc.double({ min: 0, max: 100, noNaN: true });

  it("moves up by at most `up` toward a higher target and down by at most `down` toward a lower one", () => {
    fc.assert(
      fc.property(n, n, step, step, (prev, target, up, down) => {
        const r = approach(prev, target, up, down);
        if (target > prev) {
          expect(r - prev).toBeLessThanOrEqual(up + 1e-9);
          expect(r).toBeGreaterThanOrEqual(prev);
        } else {
          expect(prev - r).toBeLessThanOrEqual(down + 1e-9);
          expect(r).toBeLessThanOrEqual(prev);
        }
      }),
    );
  });

  it("never passes the target", () => {
    fc.assert(
      fc.property(n, n, step, step, (prev, target, up, down) => {
        const r = approach(prev, target, up, down);
        expect((r - target) * (prev - target)).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.abs(r - target)).toBeLessThanOrEqual(
          Math.abs(prev - target) + 1e-9,
        );
      }),
    );
  });

  it("lands exactly on the target when it is within one step", () => {
    fc.assert(
      fc.property(n, n, step, step, (prev, target, up, down) => {
        fc.pre(target > prev ? target - prev <= up : prev - target <= down);
        expect(approach(prev, target, up, down)).toBeCloseTo(target, 9);
      }),
    );
  });

  it("with one step, moves the same in both directions", () => {
    fc.assert(
      fc.property(n, n, step, (prev, target, up) => {
        expect(approach(prev, target, up)).toBe(approach(prev, target, up, up));
      }),
    );
  });
});

it("converts degrees and computes forward with exact arithmetic", () => {
  fc.assert(
    fc.property(yaw, (d) => {
      expect(degToRad(d)).toBe((d * Math.PI) / 180);
      expect(forward(d)).toEqual({
        x: -Math.sin(degToRad(d)),
        z: Math.cos(degToRad(d)),
      });
    }),
  );
});
