import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, leftOf } from "../../../src/domain/shared/vec";
import {
  nearestAxis,
  type StandInAxis,
  type StandInRule,
  standInAxis,
  standInPose,
  yawGap,
} from "../../../src/domain/vehicle/standIn";

const yaw = fc.double({ min: -720, max: 720, noNaN: true });
const axis = fc.constantFrom<StandInAxis>("x", "z");
const margin = fc.double({ min: 0, max: 40, noNaN: true });
const point = fc.record({
  x: fc.double({ min: -1000, max: 1000, noNaN: true }),
  y: fc.double({ min: -64, max: 320, noNaN: true }),
  z: fc.double({ min: -1000, max: 1000, noNaN: true }),
});
const RULE: StandInRule = { name: "probe", ahead: 3.7, turnMargin: 5 };
const HALF_QUARTER = 45;

/** The angle in degrees between the row axis and the line across the heading, 0 to 90. */
function rowSkew(y: number, a: StandInAxis): number {
  const across = leftOf(forward(y));
  const along = a === "x" ? Math.abs(across.x) : Math.abs(across.z);
  return (Math.acos(Math.min(1, along)) * 180) / Math.PI;
}

describe("yawGap", () => {
  it("is symmetric, at most 180, and ignores whole turns", () => {
    fc.assert(
      fc.property(yaw, yaw, fc.integer({ min: -3, max: 3 }), (a, b, turns) => {
        const gap = yawGap(a, b);
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(180);
        expect(yawGap(b, a)).toBeCloseTo(gap, 9);
        expect(yawGap(a + turns * 360, b)).toBeCloseTo(gap, 6);
      }),
    );
  });
});

describe("nearestAxis", () => {
  it("lays the row within 45 degrees of the line across the heading", () => {
    fc.assert(
      fc.property(yaw, (y) => {
        expect(rowSkew(y, nearestAxis(y))).toBeLessThanOrEqual(
          HALF_QUARTER + 1e-6,
        );
      }),
    );
  });

  it.each([
    [0, "x"],
    [180, "x"],
    [-180, "x"],
    [90, "z"],
    [-90, "z"],
    [270, "z"],
    [44, "x"],
    [136, "x"],
    [-46, "z"],
  ] as const)("puts yaw %d on axis %s", (y, a) => {
    expect(nearestAxis(y)).toBe(a);
  });
});

describe("standInAxis", () => {
  it("is the current axis or the nearest one", () => {
    fc.assert(
      fc.property(yaw, axis, margin, (y, current, m) => {
        expect([current, nearestAxis(y)]).toContain(standInAxis(y, current, m));
      }),
    );
  });

  it("never lays the row more than 45 degrees plus the margin off the line across the heading", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.option(axis, { nil: undefined }),
        margin,
        (y, current, m) => {
          expect(rowSkew(y, standInAxis(y, current, m))).toBeLessThanOrEqual(
            HALF_QUARTER + m + 1e-6,
          );
        },
      ),
    );
  });

  it("keeps the current axis within the margin past the 45-degree line", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -4, max: 4 }),
        margin,
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        fc.boolean(),
        (quarter, m, share, left) => {
          const facing = quarter * 90;
          const current = nearestAxis(facing);
          const off = (HALF_QUARTER + m) * share * (left ? 1 : -1);
          expect(standInAxis(facing + off, current, m)).toBe(current);
        },
      ),
    );
  });

  it("swaps once the yaw is past the margin", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -4, max: 4 }),
        margin,
        fc.double({ min: 1e-6, max: 44 - 1e-6, noNaN: true }),
        fc.boolean(),
        (quarter, m, past, left) => {
          fc.pre(HALF_QUARTER + m + past < 90);
          const facing = quarter * 90;
          const current = nearestAxis(facing);
          const y = facing + (HALF_QUARTER + m + past) * (left ? 1 : -1);
          expect(standInAxis(y, current, m)).not.toBe(current);
        },
      ),
    );
  });

  it("gives a yaw a whole number of quarters turned its own axis whatever the stand-in had", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        fc.option(axis, { nil: undefined }),
        margin,
        (quarter, current, m) => {
          const y = quarter * 90;
          expect(standInAxis(y, current, m)).toBe(
            Math.abs(quarter) % 2 === 0 ? "x" : "z",
          );
          expect(rowSkew(y, standInAxis(y, current, m))).toBeCloseTo(0, 6);
        },
      ),
    );
  });
});

describe("standInPose", () => {
  it("stands `ahead` along the true heading, at the vehicle's feet, with the rule's name and the axis", () => {
    fc.assert(
      fc.property(point, yaw, axis, (at, y, a) => {
        const pose = standInPose(RULE, at, y, a);
        const f = forward(y);
        expect(pose.name).toBe(RULE.name);
        expect(pose.axis).toBe(a);
        expect(pose.y).toBe(at.y);
        expect(pose.x).toBeCloseTo(at.x + f.x * RULE.ahead, 6);
        expect(pose.z).toBeCloseTo(at.z + f.z * RULE.ahead, 6);
      }),
    );
  });

  it.each([
    [0, { x: 0, z: 3.7 }],
    [90, { x: -3.7, z: 0 }],
    [-180, { x: 0, z: -3.7 }],
    [180, { x: 0, z: -3.7 }],
    [-90, { x: 3.7, z: 0 }],
  ] as const)("is exact at yaw %d", (y, offset) => {
    const pose = standInPose(RULE, { x: 10.5, y: 64, z: -20.5 }, y, "x");
    expect(pose.x).toBe(10.5 + offset.x);
    expect(pose.z).toBe(-20.5 + offset.z);
  });
});
