import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { turnedCorners } from "../support/geometry";

type Vec = [number, number, number];
type Cube = {
  origin: Vec;
  size: Vec;
  uv: Record<string, never>;
  pivot?: Vec;
  rotation?: Vec;
};

// Runs tilt_assembly from tools/cube_tilt.py. The module is pure, so it loads on its own.
const tilt = (cubes: Cube[], pivot: Vec, degrees: number): Cube[] => {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "import cube_tilt",
    "args = json.loads(sys.stdin.read())",
    "print(json.dumps(cube_tilt.tilt_assembly(args['cubes'], args['pivot'], 'x', args['degrees'], 'wheel', {'wheel': {'owner': 'test', 'cubes': len(args['cubes'])}})))",
  ].join("\n");
  const out = execFileSync("python3", ["-I", "-c", script], {
    input: JSON.stringify({ cubes, pivot, degrees }),
    encoding: "utf8",
  });
  return JSON.parse(out);
};

// JSON turns -0 into 0, so compare against what the helper actually sent.
const sent = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const measure = (cubes: Cube[]): { corners: Vec[][]; bounds: [Vec, Vec] } => {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "import cube_tilt",
    "cubes = json.loads(sys.stdin.read())",
    "print(json.dumps({'corners': [cube_tilt.corners(c) for c in cubes], 'bounds': cube_tilt.bounds(cubes)}))",
  ].join("\n");
  return JSON.parse(
    execFileSync("python3", ["-I", "-c", script], {
      input: JSON.stringify(cubes),
      encoding: "utf8",
    }),
  );
};

const rad = (degrees: number) => (degrees * Math.PI) / 180;
type Matrix = number[][];
const mul = (a: Matrix, b: Matrix): Matrix =>
  [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) =>
      [0, 1, 2].reduce(
        (sum, k) => sum + (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0),
        0,
      ),
    ),
  );
// The preview's rotate(): x, then y, then z, so the matrix is Rz * Ry * Rx.
const rx = (d: number): Matrix => [
  [1, 0, 0],
  [0, Math.cos(rad(d)), -Math.sin(rad(d))],
  [0, Math.sin(rad(d)), Math.cos(rad(d))],
];
const ry = (d: number): Matrix => [
  [Math.cos(rad(d)), 0, Math.sin(rad(d))],
  [0, 1, 0],
  [-Math.sin(rad(d)), 0, Math.cos(rad(d))],
];
const rz = (d: number): Matrix => [
  [Math.cos(rad(d)), -Math.sin(rad(d)), 0],
  [Math.sin(rad(d)), Math.cos(rad(d)), 0],
  [0, 0, 1],
];
// A game rotation turns x and z the other way from the preview (ADR 0051, 0058).
const matrixOf = ([x, y, z]: Vec) => mul(rz(-z), mul(ry(y), rx(-x)));

const at = <T>(list: T[], i: number): T => {
  const value = list[i];
  if (value === undefined) throw new Error(`no item ${i}`);
  return value;
};
// "+ 0" turns -0 into 0, which JSON would drop anyway.
const coord = fc
  .double({ min: -20, max: 20, noNaN: true })
  .map((value) => value + 0);
const vec = fc.tuple(coord, coord, coord) as fc.Arbitrary<Vec>;
const cube = fc
  .record({
    origin: vec,
    size: fc.tuple(
      fc.double({ min: 0.1, max: 4, noNaN: true }),
      fc.double({ min: 0.1, max: 4, noNaN: true }),
      fc.double({ min: 0.1, max: 4, noNaN: true }),
    ) as fc.Arbitrary<Vec>,
    pivot: vec,
    z: fc.double({ min: -179, max: 179, noNaN: true }),
  })
  .map(
    ({ origin, size, pivot, z }): Cube => ({
      origin,
      size,
      uv: {},
      pivot,
      rotation: [0, 0, z],
    }),
  );
const angle = fc.double({ min: -80, max: 80, noNaN: true });
const runs = { numRuns: 25 };

const close = (a: number[], b: number[], tolerance: number) => {
  for (let i = 0; i < a.length; i++) {
    expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(tolerance);
  }
};

describe("cube corners and bounds (ADR 0173)", () => {
  it("matches game corners for any single-axis turn about any pivot", () => {
    fc.assert(
      fc.property(cube, angle, (one, degrees) => {
        for (const axis of [0, 1, 2]) {
          const rotation: Vec = [0, 0, 0];
          rotation[axis] = degrees;
          const turned = { ...one, rotation };
          const actual = at(measure([turned]).corners, 0);
          const remaining = turnedCorners({ name: "root" }, turned);
          expect(actual).toHaveLength(8);
          for (const point of actual) {
            const index = remaining.findIndex((candidate) =>
              point.every(
                (value, i) => Math.abs(value - at(candidate, i)) < 1e-6,
              ),
            );
            expect(index).toBeGreaterThanOrEqual(0);
            remaining.splice(index, 1);
          }
          expect(remaining).toHaveLength(0);
        }
      }),
      runs,
    );
  });

  it("returns unrotated corners in bit order x + 2y + 4z", () => {
    fc.assert(
      fc.property(cube, ({ origin, size }) => {
        const one = { origin, size, uv: {} };
        const expected = Array.from({ length: 8 }, (_, n) =>
          origin.map(
            (value, axis) => value + at(size, axis) * ((n >> axis) & 1),
          ),
        );
        expect(at(measure([one]).corners, 0)).toEqual(sent(expected));
      }),
      runs,
    );
  });

  it("bounds every corner with the per-axis minimum and maximum", () => {
    fc.assert(
      fc.property(fc.array(cube, { minLength: 1, maxLength: 5 }), (cubes) => {
        const {
          corners,
          bounds: [lo, hi],
        } = measure(cubes);
        const points = corners.flat();
        for (const axis of [0, 1, 2]) {
          const values = points.map((point) => at(point, axis));
          expect(at(lo, axis) + 0).toBe(Math.min(...values) + 0);
          expect(at(hi, axis) + 0).toBe(Math.max(...values) + 0);
          for (const value of values) {
            expect(value).toBeGreaterThanOrEqual(at(lo, axis));
            expect(value).toBeLessThanOrEqual(at(hi, axis));
          }
        }
      }),
      runs,
    );
  });
});

describe("tilt_assembly (ADR 0166)", () => {
  it("returns the original cubes after tilting by a and then by -a", () => {
    fc.assert(
      fc.property(
        fc.array(cube, { minLength: 1, maxLength: 5 }),
        vec,
        angle,
        (cubes, pivot, a) => {
          const back = tilt(tilt(cubes, pivot, a), pivot, -a);
          back.forEach((b, i) => {
            close(b.origin, at(cubes, i).origin, 1e-9);
            close(b.pivot ?? [], at(cubes, i).pivot ?? [], 1e-9);
            close(b.rotation ?? [], at(cubes, i).rotation ?? [], 1e-9);
          });
        },
      ),
      runs,
    );
  });

  it("keeps the distance between any two cube pivots", () => {
    fc.assert(
      fc.property(
        fc.array(cube, { minLength: 2, maxLength: 5 }),
        vec,
        angle,
        (cubes, pivot, a) => {
          const moved = tilt(cubes, pivot, a);
          const dist = (list: Cube[], i: number, j: number) =>
            Math.hypot(
              ...[0, 1, 2].map(
                (k) =>
                  (at(list, i).pivot?.[k] ?? 0) - (at(list, j).pivot?.[k] ?? 0),
              ),
            );
          for (let i = 0; i < cubes.length; i++) {
            for (let j = i + 1; j < cubes.length; j++) {
              expect(
                Math.abs(dist(moved, i, j) - dist(cubes, i, j)),
              ).toBeLessThan(1e-9);
            }
          }
        },
      ),
      runs,
    );
  });

  it("composes the tilt after the cube's own z turn, Rx * Rz", () => {
    fc.assert(
      fc.property(cube, vec, angle, (one, pivot, a) => {
        const moved = at(tilt([one], pivot, a), 0);
        const expected = mul(rx(-a), matrixOf(one.rotation as Vec));
        const actual = matrixOf(moved.rotation as Vec);
        close(actual.flat(), expected.flat(), 1e-9);
      }),
      runs,
    );
  });

  it("changes nothing for 0 degrees", () => {
    fc.assert(
      fc.property(
        fc.array(cube, { minLength: 1, maxLength: 3 }),
        vec,
        (cubes, pivot) => {
          expect(tilt(cubes, pivot, 0)).toEqual(sent(cubes));
        },
      ),
      runs,
    );
  });

  it("changes nothing for 0 degrees when a rotation component is negative zero", () => {
    const cubes: Cube[] = [
      {
        origin: [0, 0, 0],
        size: [0.1, 0.1, 0.1],
        uv: {},
        pivot: [0, 0, 0],
        rotation: [0, 0, -0],
      },
      {
        origin: [0, 0, 0],
        size: [0.1, 0.1, 0.1],
        uv: {},
        pivot: [0, 0, 0],
        rotation: [0, 0, 0],
      },
    ];
    expect(tilt(cubes, [0, 0, 0], 0)).toEqual(sent(cubes));
  });

  it("requires a declared assembly for compound tilt results", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 75 }),
        fc.integer({ min: 5, max: 75 }),
        (z, degrees) => {
          const script = [
            "import json, sys",
            "sys.path.insert(0, 'tools')",
            "from cube_tilt import tilt_assembly, assert_axes",
            "z, degrees = json.loads(sys.stdin.read())",
            "cube = {'origin': [0, 0, 0], 'size': [1, 1, 1], 'rotation': [0, 0, z]}",
            "registry = {'test': {'owner': 'test', 'cubes': 1}}",
            "moved = tilt_assembly([cube], [0, 0, 0], 'x', degrees, 'test', registry)",
            "for name, table, angle in [('unknown', registry, degrees), (None, registry, degrees), ('test', {}, degrees), ('unknown', registry, 0)]:",
            "    try:",
            "        tilt_assembly(moved if angle == 0 else [cube], [0, 0, 0], 'x', angle, name, table)",
            "    except ValueError:",
            "        pass",
            "    else:",
            "        raise AssertionError('undeclared assembly accepted')",
            "assert_axes(moved, {'test': json.loads(json.dumps(moved))})",
            "try:",
            "    assert_axes(moved, {'test': [cube]})",
            "except ValueError:",
            "    pass",
            "else:",
            "    raise AssertionError('unregistered cube accepted')",
            "assert_axes([{}, {'rotation': [z, 1e-6, -1e-6]}], {})",
            "print('ok')",
          ].join("\n");
          expect(
            execFileSync("python3", ["-I", "-c", script], {
              input: JSON.stringify([z, degrees]),
              encoding: "utf8",
            }).trim(),
          ).toBe("ok");
        },
      ),
      runs,
    );
  });
});
