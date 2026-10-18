import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dot,
  forward,
  rightOf,
  type Vec3,
} from "../../../../../src/domain/shared/vec";
import {
  type BodyEnds,
  endBlocked,
  guardEnds,
} from "../../../../../src/domain/vehicle/kinds/camper/bodyGuard";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
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
const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const heading = number(0, 360);
const forwardSpeed = number(0.01, CAMPER_SPEC.maxSpeed);
const reverseSpeed = number(-CAMPER_SPEC.maxReverse, -0.01);
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

function motion(yaw: number, speed: number): MotionResult {
  return {
    state: { ...initialMotion(yaw), speed },
    forward: forward(yaw),
    impulse: { x: 0.3, z: -0.2 },
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

function endPoint(yaw: number, speed: number, layer: number, lane = 0): Vec3 {
  const f = forward(yaw);
  const r = rightOf(f);
  const reach = speed > 0 ? ends.front + speed : -(ends.rear - speed);
  return { x: f.x * reach + r.x * lane, y: layer, z: f.z * reach + r.z * lane };
}

describe("camper body end guard", () => {
  it("stops at either upper wall layer across the front or rear width at any heading", () => {
    fc.assert(
      fc.property(
        heading,
        fc.oneof(forwardSpeed, reverseSpeed),
        position,
        velocity,
        fc.constantFrom(2, 3),
        fc.constantFrom(0, -1.4, 1.4),
        (yaw, speed, at, v, layer, lane) => {
          const step = motion(yaw, speed);
          const before = structuredClone(step);
          const sensor = world(at, [endPoint(yaw, speed, layer, lane)]);
          const result = guardEnds(
            step,
            { velocity: v, solidAt: sensor.solidAt },
            ends,
          );
          expect(result.state.speed).toBe(0);
          expect(result.blocked).toBe(true);
          expect(result.impulse).toEqual({ x: -v.x, z: -v.z });
          expect(result.state).toEqual({ ...step.state, speed: 0 });
          expect(step).toEqual(before);
          expect(result.forward).toBe(step.forward);
          expect(result.jumpVelocity).toBe(step.jumpVelocity);
          expect(sensor.queries.length).toBeLessThanOrEqual(6);
        },
      ),
    );
  });

  it("returns the same step when only layers zero and one contain steps", () => {
    fc.assert(
      fc.property(heading, forwardSpeed, position, (yaw, speed, at) => {
        const step = motion(yaw, speed);
        const sensor = world(
          at,
          [0, 1].flatMap((layer) =>
            [-1.4, 0, 1.4].map((lane) => endPoint(yaw, speed, layer, lane)),
          ),
        );
        expect(
          guardEnds(
            step,
            { velocity: { x: 0, y: 0, z: 0 }, solidAt: sensor.solidAt },
            ends,
          ),
        ).toBe(step);
        expect(sensor.queries).toHaveLength(6);
      }),
    );
  });

  it("ignores walls behind the direction of travel, in both forward and reverse", () => {
    fc.assert(
      fc.property(
        heading,
        fc.oneof(forwardSpeed, reverseSpeed),
        position,
        (yaw, speed, at) => {
          const step = motion(yaw, speed);
          const oppositeSpeed = speed > 0 ? -0.1 : 0.1;
          const sensor = world(
            at,
            [2, 3].flatMap((layer) =>
              [-1.4, 0, 1.4].map((lane) =>
                endPoint(yaw, oppositeSpeed, layer, lane),
              ),
            ),
          );
          expect(
            guardEnds(
              step,
              { velocity: { x: 0, y: 0, z: 0 }, solidAt: sensor.solidAt },
              ends,
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

  it("uses at most six queries for arbitrary headings, speeds, and occupied world cells", () => {
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
        walls,
        (yaw, speed, at, occupied) => {
          const step = motion(yaw, speed);
          const sensor = world(at, occupied);
          guardEnds(
            step,
            { velocity: { x: 0, y: 0, z: 0 }, solidAt: sensor.solidAt },
            ends,
          );
          expect(sensor.queries.length).toBeLessThanOrEqual(6);
          for (const offset of sensor.queries)
            expect(
              dot(offset, step.forward) * Math.sign(speed),
            ).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("makes no queries at rest and preserves the step", () => {
    fc.assert(
      fc.property(heading, position, velocity, (yaw, at, v) => {
        const step = motion(yaw, 0);
        const sensor = world(at, [endPoint(yaw, 0.1, 2)]);
        expect(
          guardEnds(step, { velocity: v, solidAt: sensor.solidAt }, ends),
        ).toBe(step);
        expect(sensor.queries).toHaveLength(0);
      }),
    );
  });

  it("stops on the first center hit before probing the sides", () => {
    fc.assert(
      fc.property(heading, forwardSpeed, position, (yaw, speed, at) => {
        const sensor = world(at, [endPoint(yaw, speed, 2)]);
        expect(
          endBlocked(sensor.solidAt, forward(yaw), ends.front + speed, ends),
        ).toBe(true);
        expect(sensor.queries).toEqual([endPoint(yaw, speed, 2)]);
      }),
    );
  });
});
