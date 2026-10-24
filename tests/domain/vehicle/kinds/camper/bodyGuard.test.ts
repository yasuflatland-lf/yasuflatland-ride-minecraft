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
import {
  CAMPER_MOTION,
  CAMPER_TYRES,
} from "../../../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { MOTION } from "../../../../../src/domain/vehicle/motion/constants";
import type { Form } from "../../../../../src/domain/vehicle/motion/forms";
import {
  initialMotion,
  type MotionResult,
  stepMotion,
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

/** Queries per tick: two layers in car form and four in the others, per lane, per block the end crosses. */
function budget(form: Form, move: number): number {
  const layers = LAYERS - lowestBlockingLayer(form);
  return layers * LANES.length * (move <= 1 ? 1 : 2);
}

// The body's move per tick at top speed on default ground, about 1.30 blocks.
const TOP_MOVE = CAMPER_SPEC.maxSpeed / MOTION.defaultFriction;
const move = number(0.05, TOP_MOVE);

/**
 * Drives the end that `sign` picks toward `solid` (world cells) at `step`
 * blocks per tick, and returns each lane's end point in world coordinates
 * after every tick, and whether the guard stopped the body.
 */
function driveInto(
  yaw: number,
  sign: 1 | -1,
  start: Vec3,
  step: number,
  solid: (cell: Vec3) => boolean,
): { lanePoints: Vec3[][]; stopped: boolean } {
  const f = forward(yaw);
  const dir = { x: f.x * sign, z: f.z * sign };
  const r = rightOf(dir);
  const end = sign > 0 ? ends.front : ends.rear;
  const at = { ...start };
  const points = () =>
    LANES.map((s) => ({
      x: at.x + dir.x * end + r.x * s,
      y: at.y,
      z: at.z + dir.z * end + r.z * s,
    }));
  const lanePoints = [points()];
  for (let tick = 0; tick < 200; tick++) {
    const result = guardEnds(
      {
        ...motion(yaw, sign * 0.5),
        impulse: { x: dir.x * step, z: dir.z * step },
      },
      {
        velocity: STILL,
        solidAt: (o) =>
          solid({
            x: Math.floor(at.x + o.x),
            y: Math.floor(at.y + o.y),
            z: Math.floor(at.z + o.z),
          }),
      },
      ends,
      "car",
    );
    if (result.blocked) return { lanePoints, stopped: true };
    at.x += dir.x * step;
    at.z += dir.z * step;
    lanePoints.push(points());
  }
  return { lanePoints, stopped: false };
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

// forward() at a cardinal yaw leaves sin/cos rounding of about 1e-16, so a probe
// exactly on a wall face can land a hair across it.
const FACE_EPSILON = 1e-9;

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
          expect(
            endBlocked(sensor.solidAt, f, ends.front, reach, ends, 2),
          ).toBe(true);
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
          const base = motion(yaw, speed);
          const step = {
            ...base,
            state: { ...base.state, stepTicks },
            jumpVelocity: 0.45,
          };
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
            expect(sensor.queries).toHaveLength(budget("car", travel(v)));
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
    ["car", 8, 16],
    ["hover", 16, 32],
    ["submarine", 16, 32],
  ] as const)(
    "uses at most the %s-form budget of %i queries within one block and %i across two, for any heading, speed, and occupied cells",
    (form, oneBlock, twoBlocks) => {
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
            expect(sensor.queries.length).toBeLessThanOrEqual(
              travel(v) <= 1 ? oneBlock : twoBlocks,
            );
            for (const offset of sensor.queries)
              expect(
                dot(offset, step.forward) * Math.sign(speed),
              ).toBeGreaterThan(0);
          },
        ),
      );
      // An open world spends the whole budget.
      const near = world(STILL, []);
      guardEnds(
        motion(0, 0.5),
        { velocity: STILL, solidAt: near.solidAt },
        ends,
        form,
      );
      expect(near.queries).toHaveLength(oneBlock);
      const far = world(STILL, []);
      guardEnds(
        motion(0, 0.5),
        { velocity: { x: 1, y: 0, z: 0 }, solidAt: far.solidAt },
        ends,
        form,
      );
      expect(far.queries).toHaveLength(twoBlocks);
    },
  );

  it("samples only the cells behind the rear when reversing, at any whole-degree heading", () => {
    // Whole degrees, since fc.double draws most headings within a hair of 0,
    // where the forward axis has no x component to get wrong.
    const wholeHeading = fc.integer({ min: 0, max: 359 });
    fc.assert(
      fc.property(
        wholeHeading,
        reverseSpeed,
        position,
        velocity,
        anyForm,
        (yaw, speed, at, v, form) => {
          const sensor = world(at, []);
          guardEnds(
            motion(yaw, speed),
            { velocity: v, solidAt: sensor.solidAt },
            ends,
            form,
          );
          const back = { x: -forward(yaw).x, z: -forward(yaw).z };
          expect(sensor.queries.length).toBeGreaterThan(0);
          for (const offset of sensor.queries) {
            expect(dot(offset, back)).toBeGreaterThan(ends.rear);
            expect(dot(offset, back)).toBeLessThanOrEqual(
              ends.rear + travel(v) + 1e-9,
            );
            expect(Math.abs(dot(offset, rightOf(back)))).toBeLessThan(
              ends.halfWidth,
            );
          }
        },
      ),
      { examples: [[90, -0.3, STILL, STILL, "car"]] },
    );
  });

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

  it("samples every block from the front to this tick's applied move, not the internal speed", () => {
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
          const reach = ends.front + travel(v);
          const along = sensor.queries.map((o) => dot(o, forward(yaw)));
          for (const d of along) {
            expect(d).toBeGreaterThan(ends.front);
            expect(d).toBeLessThanOrEqual(reach + 1e-9);
          }
          const samples = [...new Set(along.map((d) => d.toFixed(9)))]
            .map(Number)
            .sort((a, b) => a - b);
          expect(samples[samples.length - 1]).toBeCloseTo(reach, 9);
          const gaps = [ends.front, ...samples]
            .slice(1)
            .map((d, i) => d - ([ends.front, ...samples][i] ?? 0));
          for (const gap of gaps) expect(gap).toBeLessThanOrEqual(1 + 1e-9);
        },
      ),
    );
  });

  it.each([
    ["front", 1],
    ["rear", -1],
  ] as const)(
    "never lets the %s pass a one-thick wall at any heading, start, and speed up to top speed",
    (_end, sign) => {
      fc.assert(
        fc.property(
          heading,
          position,
          number(0, 5),
          move,
          (yaw, at, gap, step) => {
            const f = forward(yaw);
            const dir = { x: f.x * sign, z: f.z * sign };
            const alongX = Math.abs(dir.x) >= Math.abs(dir.z);
            const toward = Math.sign(alongX ? dir.x : dir.z);
            const coord = (p: Vec3) => (alongX ? p.x : p.z);
            const start = driveInto(yaw, sign, at, 0, () => false)
              .lanePoints[0] as Vec3[];
            const lead =
              toward * Math.max(...start.map((p) => toward * coord(p)));
            // The wall's cell index: its near face lies `gap` or more beyond the leading lane.
            const wall =
              toward > 0
                ? Math.floor(lead + gap) + 1
                : Math.floor(lead - gap) - 1;
            const run = driveInto(
              yaw,
              sign,
              at,
              step,
              (c) => (alongX ? c.x : c.z) === wall,
            );
            expect(run.stopped).toBe(true);
            for (const points of run.lanePoints)
              for (const p of points)
                if (toward > 0)
                  expect(coord(p)).toBeLessThan(wall + FACE_EPSILON);
                else
                  expect(coord(p)).toBeGreaterThanOrEqual(
                    wall + 1 - FACE_EPSILON,
                  );
          },
        ),
      );
    },
  );

  it("never lets the front pass a one-wide pillar anywhere across the body at a cardinal heading", () => {
    const side = ends.halfWidth - 0.1;
    fc.assert(
      fc.property(
        fc.constantFrom(0, 90, 180, 270),
        position,
        number(-side, side),
        number(0, 5),
        move,
        (yaw, at, lateral, gap, step) => {
          const f = forward(yaw);
          const r = rightOf(f);
          const alongX = Math.abs(f.x) > 0.5;
          const toward = Math.round(alongX ? f.x : f.z);
          const along = (p: Vec3) => (alongX ? p.x : p.z);
          const across = (p: Vec3) => (alongX ? p.z : p.x);
          const front = {
            x: at.x + f.x * ends.front + r.x * lateral,
            y: at.y,
            z: at.z + f.z * ends.front + r.z * lateral,
          };
          const row = Math.floor(across(front));
          const column =
            toward > 0
              ? Math.floor(along(front) + gap) + 1
              : Math.floor(along(front) - gap) - 1;
          const run = driveInto(
            yaw,
            1,
            at,
            step,
            (c) =>
              (alongX ? c.x : c.z) === column && (alongX ? c.z : c.x) === row,
          );
          expect(run.stopped).toBe(true);
          const first = run.lanePoints[0] ?? [];
          expect(first.some((p) => Math.floor(across(p)) === row)).toBe(true);
          for (const points of run.lanePoints)
            for (const p of points)
              if (Math.floor(across(p)) === row) {
                if (toward > 0)
                  expect(along(p)).toBeLessThan(column + FACE_EPSILON);
                else
                  expect(along(p)).toBeGreaterThanOrEqual(
                    column + 1 - FACE_EPSILON,
                  );
              }
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
            ends.front,
            ends.front + travel(STILL),
            ends,
            2,
          ),
        ).toBe(true);
        expect(sensor.queries).toEqual([hit]);
      }),
    );
  });

  it("still stops a camper whose front cells are solid after the motion step slid it along a wall (ADR 0067, 0081)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 80 }),
        fc
          .integer({ min: 30, max: Math.round(CAMPER_SPEC.maxSpeed * 100) })
          .map((n) => n / 100),
        (theta, speed) => {
          const yaw = -90 + theta;
          const f = forward(yaw);
          const given = speed / MOTION.defaultFriction;
          const prev = {
            ...initialMotion(yaw),
            speed,
            friction: MOTION.defaultFriction,
            expected: { x: f.x * given, z: f.z * given },
          };
          const v = { x: 0, z: f.z * speed };
          const moved = stepMotion(
            prev,
            { throttle: 1, steer: 0, handbrake: false, creep: false },
            { velocity: v, onGround: true },
            () => 0,
            CAMPER_MOTION,
            CAMPER_TYRES,
          );
          expect(moved.blocked).toBe(true);
          expect(moved.state.speed).toBeGreaterThan(0);
          const result = guardEnds(
            moved,
            { velocity: { x: v.x, y: 0, z: v.z }, solidAt: () => true },
            ends,
            "car",
          );
          expect(result.state.speed).toBe(0);
          expect(result.blocked).toBe(true);
          expect(result.impulse).toEqual({ x: -v.x, z: -v.z });
        },
      ),
    );
  });
});
