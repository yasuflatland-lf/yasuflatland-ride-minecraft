import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dot,
  forward,
  rightOf,
  type Vec2,
  type Vec3,
} from "../../../../../src/domain/shared/vec";
import {
  type BodyEnds,
  endBlocked,
  endLanes,
  guardEnds,
  lowestBlockingLayer,
} from "../../../../../src/domain/vehicle/kinds/camper/bodyGuard";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import type { Form } from "../../../../../src/domain/vehicle/motion/forms";
import {
  initialMotion,
  type MotionResult,
} from "../../../../../src/domain/vehicle/motion/motion";

const ends: BodyEnds = {
  front: CAMPER_SPEC.bodyFront,
  rear: CAMPER_SPEC.bodyRear,
  halfWidth: CAMPER_SPEC.bodyHalfWidth,
  height: CAMPER_SPEC.carHeight,
};
const LANES = endLanes(ends.halfWidth);
const LAYERS = Math.ceil(ends.height);
const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const heading = number(0, 360);
const forwardSpeed = number(0.01, CAMPER_SPEC.maxSpeed);
const reverseSpeed = number(-CAMPER_SPEC.maxReverse, -0.01);
const anyForm = fc.constantFrom<Form>("car", "hover", "submarine");
const position = fc.record({
  x: number(-100, 100),
  y: fc.integer({ min: -60, max: 250 }),
  z: number(-100, 100),
});
const velocity = fc.record({
  x: number(-1, 1),
  y: number(-1, 1),
  z: number(-1, 1),
});
const IMPULSE: Vec2 = { x: 0.3, z: -0.2 };
const STILL: Vec3 = { x: 0, y: 0, z: 0 };

function motion(yaw: number, speed: number): MotionResult {
  return {
    state: { ...initialMotion(yaw), speed },
    forward: forward(yaw),
    impulse: IMPULSE,
    jumpVelocity: 0,
    blocked: false,
  };
}

function cell(at: Vec3, offset: Vec3): string {
  return `${Math.floor(at.x + offset.x)},${Math.floor(at.y + offset.y)},${Math.floor(at.z + offset.z)}`;
}

function world(at: Vec3, walls: readonly Vec3[]) {
  const cells = new Set(walls.map((offset) => cell(at, offset)));
  const queries: Vec3[] = [];
  return {
    queries,
    solidAt(offset: Vec3) {
      queries.push(offset);
      return cells.has(cell(at, offset));
    },
  };
}

/** How far the body moves this tick: the velocity the engine applies. */
function travel(v: Vec3): number {
  return Math.hypot(v.x + IMPULSE.x, v.z + IMPULSE.z);
}

function endPoint(
  yaw: number,
  speed: number,
  v: Vec3,
  layer: number,
  lane = 0,
): Vec3 {
  const f = forward(yaw);
  const r = rightOf(f);
  const reach = speed > 0 ? ends.front + travel(v) : -(ends.rear + travel(v));
  return { x: f.x * reach + r.x * lane, y: layer, z: f.z * reach + r.z * lane };
}

describe("camper end lanes", () => {
  it("are center-most first, at most one block apart, and reach both sides of any body", () => {
    fc.assert(
      fc.property(number(0.1, 6), (halfWidth) => {
        const lanes = endLanes(halfWidth);
        const side = halfWidth - 0.1;
        const sorted = [...lanes].sort((a, b) => a - b);
        expect(sorted[0]).toBeCloseTo(-side, 9);
        expect(sorted[sorted.length - 1]).toBeCloseTo(side, 9);
        const gaps = sorted.slice(1).map((lane, i) => lane - (sorted[i] ?? 0));
        for (const gap of gaps) expect(gap).toBeLessThanOrEqual(1 + 1e-9);
        const reach = lanes.map(Math.abs);
        for (const [i, r] of reach.slice(1).entries())
          expect(r).toBeGreaterThanOrEqual((reach[i] ?? 0) - 1e-9);
      }),
    );
  });

  it("gives the camper four lanes", () => {
    expect(LANES).toHaveLength(4);
    const sorted = [...LANES].sort((a, b) => a - b);
    const expected = [-1.4, -1.4 / 3, 1.4 / 3, 1.4];
    for (const [i, lane] of sorted.entries())
      expect(lane).toBeCloseTo(expected[i] ?? Number.NaN, 9);
  });

  it("finds a one-wide pillar in any cell across the body at a cardinal heading", () => {
    const side = ends.halfWidth - 0.1;
    fc.assert(
      fc.property(
        fc.constantFrom(0, 90, 180, 270),
        position,
        number(-side, side),
        number(0, 1.5),
        (yaw, at, lane, extra) => {
          const reach = ends.front + extra;
          const f = forward(yaw);
          const r = rightOf(f);
          const pillar = {
            x: f.x * reach + r.x * lane,
            y: 2,
            z: f.z * reach + r.z * lane,
          };
          const sensor = world(at, [pillar]);
          expect(endBlocked(sensor.solidAt, f, reach, ends, 2)).toBe(true);
        },
      ),
    );
  });
});

describe("camper body end guard", () => {
  it("stops at any blocking layer across the front or rear width at any heading", () => {
    fc.assert(
      fc.property(
        heading,
        fc.oneof(forwardSpeed, reverseSpeed),
        position,
        velocity,
        anyForm,
        fc.integer({ min: 0, max: LAYERS - 1 }),
        fc.constantFrom(...LANES),
        fc.integer({ min: 0, max: 10 }),
        (yaw, speed, at, v, form, layer, lane, stepTicks) => {
          fc.pre(layer >= lowestBlockingLayer(form));
          const step = {
            ...motion(yaw, speed),
            jumpVelocity: 0.45,
          };
          step.state.stepTicks = stepTicks;
          const before = structuredClone(step);
          const sensor = world(at, [endPoint(yaw, speed, v, layer, lane)]);
          const result = guardEnds(
            step,
            { velocity: v, solidAt: sensor.solidAt },
            ends,
            form,
          );
          expect(result.state.speed).toBe(0);
          expect(result.blocked).toBe(true);
          expect(result.impulse).toEqual({ x: -v.x, z: -v.z });
          expect(result.jumpVelocity).toBe(0);
          expect(result.state).toEqual({
            ...step.state,
            speed: 0,
            stepTicks: 0,
          });
          expect(step).toEqual(before);
          expect(result.forward).toBe(step.forward);
        },
      ),
    );
  });

  it("lets layers zero and one through in car form only", () => {
    fc.assert(
      fc.property(
        heading,
        forwardSpeed,
        position,
        velocity,
        anyForm,
        (yaw, speed, at, v, form) => {
          const step = motion(yaw, speed);
          const sensor = world(
            at,
            [0, 1].flatMap((layer) =>
              LANES.map((lane) => endPoint(yaw, speed, v, layer, lane)),
            ),
          );
          const result = guardEnds(
            step,
            { velocity: v, solidAt: sensor.solidAt },
            ends,
            form,
          );
          if (form === "car") {
            expect(result).toBe(step);
            expect(sensor.queries).toHaveLength(8);
          } else {
            expect(result.blocked).toBe(true);
            expect(result.state.speed).toBe(0);
          }
        },
      ),
    );
  });

  it("ignores walls behind the direction of travel, in both forward and reverse", () => {
    fc.assert(
      fc.property(
        heading,
        fc.oneof(forwardSpeed, reverseSpeed),
        position,
        anyForm,
        (yaw, speed, at, form) => {
          const step = motion(yaw, speed);
          const oppositeSpeed = speed > 0 ? -0.1 : 0.1;
          const sensor = world(
            at,
            [0, 1, 2, 3].flatMap((layer) =>
              LANES.map((lane) =>
                endPoint(yaw, oppositeSpeed, STILL, layer, lane),
              ),
            ),
          );
          expect(
            guardEnds(
              step,
              { velocity: STILL, solidAt: sensor.solidAt },
              ends,
              form,
            ),
          ).toBe(step);
          for (const offset of sensor.queries)
            expect(
              dot(offset, step.forward) * Math.sign(speed),
            ).toBeGreaterThan(0);
        },
      ),
    );
  });

  it.each([
    ["car", 8],
    ["hover", 16],
    ["submarine", 16],
  ] as const)(
    "uses at most %s-form budget of %i queries for any heading, speed, and occupied cells",
    (form, budget) => {
      const walls = fc.array(
        fc.record({
          x: fc.integer({ min: -7, max: 7 }),
          y: fc.integer({ min: 0, max: 5 }),
          z: fc.integer({ min: -7, max: 7 }),
        }),
        { maxLength: 100 },
      );
      fc.assert(
        fc.property(
          heading,
          number(-CAMPER_SPEC.maxReverse, CAMPER_SPEC.maxSpeed),
          position,
          velocity,
          walls,
          (yaw, speed, at, v, occupied) => {
            const step = motion(yaw, speed);
            const sensor = world(at, occupied);
            guardEnds(
              step,
              { velocity: v, solidAt: sensor.solidAt },
              ends,
              form,
            );
            expect(sensor.queries.length).toBeLessThanOrEqual(budget);
            for (const offset of sensor.queries)
              expect(
                dot(offset, step.forward) * Math.sign(speed),
              ).toBeGreaterThan(0);
          },
        ),
      );
      // An open world spends the whole budget.
      const sensor = world(STILL, []);
      guardEnds(
        motion(0, 0.5),
        { velocity: STILL, solidAt: sensor.solidAt },
        ends,
        form,
      );
      expect(sensor.queries).toHaveLength(budget);
    },
  );

  it("makes no queries at rest and preserves the step", () => {
    fc.assert(
      fc.property(heading, position, velocity, anyForm, (yaw, at, v, form) => {
        const step = motion(yaw, 0);
        const sensor = world(at, [endPoint(yaw, 0.1, v, 2)]);
        expect(
          guardEnds(step, { velocity: v, solidAt: sensor.solidAt }, ends, form),
        ).toBe(step);
        expect(sensor.queries).toHaveLength(0);
      }),
    );
  });

  it("looks ahead by this tick's applied velocity, not the internal speed", () => {
    fc.assert(
      fc.property(
        heading,
        forwardSpeed,
        position,
        velocity,
        (yaw, speed, at, v) => {
          const sensor = world(at, []);
          guardEnds(
            motion(yaw, speed),
            { velocity: v, solidAt: sensor.solidAt },
            ends,
            "car",
          );
          for (const offset of sensor.queries)
            expect(dot(offset, forward(yaw))).toBeCloseTo(
              ends.front + travel(v),
              9,
            );
        },
      ),
    );
  });

  it("stops on the first center-most hit before probing the outer lanes", () => {
    fc.assert(
      fc.property(heading, forwardSpeed, position, (yaw, speed, at) => {
        const hit = endPoint(yaw, speed, STILL, 2, LANES[0]);
        const sensor = world(at, [hit]);
        expect(
          endBlocked(
            sensor.solidAt,
            forward(yaw),
            ends.front + travel(STILL),
            ends,
            2,
          ),
        ).toBe(true);
        expect(sensor.queries).toEqual([hit]);
      }),
    );
  });
});
