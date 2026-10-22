import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dot, forward, rightOf } from "../../../src/domain/shared/vec";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { profileOf } from "../../../src/domain/vehicle/kinds/index";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import {
  isProtectedFromRam,
  type RamMount,
  ramDamage,
  selectHits,
} from "../../../src/domain/vehicle/ram";
import { SPEC } from "../../../src/domain/vehicle/spec";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
// fc.double draws most values within a hair of 0, so it barely turns the
// vehicle off the z axis. Whole hundredths of a degree cover every heading.
const yaw = fc.integer({ min: -18_000, max: 18_000 }).map((c) => c / 100);
const fastSpeed = fc.double({
  min: SPEC.ramMinSpeed + 0.001,
  max: SUV_SPEC.maxSpeed,
  noNaN: true,
});
const fastReverse = fc.double({
  min: -SUV_SPEC.maxReverse,
  max: -SPEC.ramMinSpeed - 0.001,
  noNaN: true,
});

function expectedPushMagnitude(speed: number): number {
  return SPEC.ramPushBase + Math.abs(speed) * SPEC.ramPushPerSpeed;
}

describe("ramDamage (ADR 0006)", () => {
  it("is monotonically nondecreasing with speed and at least 1 at speeds where ram occurs", () => {
    fc.assert(
      fc.property(fastSpeed, fastSpeed, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(ramDamage(lo)).toBeLessThanOrEqual(ramDamage(hi));
        expect(ramDamage(lo)).toBeGreaterThanOrEqual(1);
      }),
    );
  });

  it("is 18 at maximum speed", () => {
    expect(ramDamage(SUV_SPEC.maxSpeed)).toBe(18);
  });
});

describe("selectHits (ADR 0006)", () => {
  // Exact bounds, points at least 1e-6 inside, and points 0.01 to 3 blocks
  // outside either end. Inside points are drawn more often so that enough
  // runs land in the hit box on every axis at once.
  const around = (lo: number, hi: number) =>
    fc.oneof(
      fc.constantFrom(lo, hi).map((v) => ({ v, exact: true })),
      {
        arbitrary: number(lo + 1e-6, hi - 1e-6).map((v) => ({
          v,
          exact: false,
        })),
        weight: 3,
      },
      fc
        .oneof(number(lo - 3, lo - 0.01), number(hi + 0.01, hi + 3))
        .map((v) => ({ v, exact: false })),
    );
  const body = fc.oneof(
    fc.constantFrom(...VEHICLE_KINDS.map((k) => profileOf(k).ram)),
    fc.record({ front: number(0.5, 10), halfWidth: number(0.1, 3) }),
  );
  const target = body.chain((b) => {
    const reach = b.front + SPEC.targetHalfWidth;
    const halfWidth = b.halfWidth + SPEC.targetHalfWidth;
    return fc
      .record({
        ahead: around(0, reach),
        side: around(-halfWidth, halfWidth),
        dy: around(SPEC.ramMinDy, SPEC.ramMaxDy),
      })
      .chain(({ ahead, side, dy }) =>
        // forward(0) and rightOf are exact, so an exact bound stays on the
        // bound; at other headings rounding can push it either way.
        (ahead.exact || side.exact || dy.exact ? fc.constant(0) : yaw).map(
          (y) => ({
            body: b,
            reach,
            halfWidth,
            yaw: y,
            ahead: ahead.v,
            side: side.v,
            dy: dy.v,
          }),
        ),
      );
  });
  const speed = fc.oneof(
    fc.constantFrom(SPEC.ramMinSpeed, -SPEC.ramMinSpeed, 0),
    fastSpeed,
    fastReverse,
    number(-SUV_SPEC.maxReverse, SUV_SPEC.maxSpeed),
  );
  const mount = fc.constantFrom<RamMount | undefined>(
    undefined,
    "deckSeat",
    "vehicle",
  );
  const sinceLastHit = fc.option(
    fc.oneof(
      fc.constantFrom(SPEC.ramCooldown - 1, SPEC.ramCooldown),
      fc.integer({ min: 0, max: 3 * SPEC.ramCooldown }),
    ),
    { nil: undefined },
  );

  it("hits a target exactly when it is inside the hit box of any body, unprotected, and off cooldown", () => {
    const tick = 1000;
    fc.assert(
      fc.property(target, speed, mount, sinceLastHit, (t, s, m, since) => {
        const f = forward(t.yaw);
        const r = rightOf(f);
        // Behind the vehicle when reversing, so `ahead` is always measured
        // along the direction of travel.
        const along = t.ahead * (s < 0 ? -1 : 1);
        const offset = {
          x: f.x * along + r.x * t.side,
          y: t.dy,
          z: f.z * along + r.z * t.side,
        };
        const lastHit =
          since === undefined ? new Map() : new Map([["t", tick - since]]);
        const hits = selectHits(
          f,
          s,
          [{ id: "t", offset, mount: m }],
          lastHit,
          tick,
          t.body,
        );
        const expected =
          Math.abs(s) > SPEC.ramMinSpeed &&
          t.ahead >= 0 &&
          t.ahead <= t.reach &&
          Math.abs(t.side) <= t.halfWidth &&
          t.dy >= SPEC.ramMinDy &&
          t.dy <= SPEC.ramMaxDy &&
          m !== "vehicle" &&
          (since === undefined || since >= SPEC.ramCooldown);
        expect(hits).toHaveLength(expected ? 1 : 0);
        for (const { id, push, pushUp } of hits) {
          expect(id).toBe("t");
          expect(dot(push, f) * Math.sign(s)).toBeGreaterThan(0);
          expect(Math.hypot(push.x, push.z)).toBeCloseTo(
            expectedPushMagnitude(s),
            9,
          );
          expect(pushUp).toBe(SPEC.ramPushUp);
        }
      }),
      { numRuns: 1000 },
    );
  });

  describe("ram protection by mount (ADR 0006)", () => {
    // Slow speeds are mixed in so that the rule is checked below the ram
    // speed too, where selectHits returns no hits for anyone.
    const anySpeed = fc.oneof(
      fastSpeed,
      fastReverse,
      fc.double({
        min: -SUV_SPEC.maxReverse,
        max: SUV_SPEC.maxSpeed,
        noNaN: true,
      }),
    );
    const nearOffset = fc.record({
      x: fc.double({ min: -5, max: 5, noNaN: true }),
      y: fc.double({ min: -5, max: 5, noNaN: true }),
      z: fc.double({ min: -5, max: 5, noNaN: true }),
    });
    const lastHitTick = fc.option(fc.integer({ min: 0, max: 1000 }), {
      nil: undefined,
    });
    const tick = fc.integer({ min: 0, max: 2000 });
    const lastHitOf = (
      last: number | undefined,
    ): ReadonlyMap<string, number> =>
      last === undefined ? new Map() : new Map([["t", last]]);

    it("protects only a target that rides a vehicle", () => {
      expect(
        isProtectedFromRam({
          id: "t",
          offset: { x: 0, y: 0, z: 1 },
          mount: "vehicle",
        }),
      ).toBe(true);
      expect(
        isProtectedFromRam({
          id: "t",
          offset: { x: 0, y: 0, z: 1 },
          mount: "deckSeat",
        }),
      ).toBe(false);
      expect(
        isProtectedFromRam({ id: "t", offset: { x: 0, y: 0, z: 1 } }),
      ).toBe(false);
    });

    it("treats a deck-seat rider like a target on foot", () => {
      fc.assert(
        fc.property(
          yaw,
          anySpeed,
          nearOffset,
          lastHitTick,
          tick,
          (y, s, offset, last, now) => {
            const f = forward(y);
            const lastHit = lastHitOf(last);
            expect(
              selectHits(
                f,
                s,
                [{ id: "t", offset, mount: "deckSeat" }],
                lastHit,
                now,
                SUV_PROFILE.ram,
              ),
            ).toEqual(
              selectHits(
                f,
                s,
                [{ id: "t", offset }],
                lastHit,
                now,
                SUV_PROFILE.ram,
              ),
            );
          },
        ),
      );
    });
  });
});
