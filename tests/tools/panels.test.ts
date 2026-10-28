import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Vec = [number, number, number];
type Cube = {
  origin: Vec;
  size: Vec;
  uv: Record<string, unknown>;
  pivot?: Vec;
  rotation?: Vec;
};

const FACE = { uv: [0, 0], uv_size: [8, 8] };

// Runs a call from tools/panels.py. The module is pure, so it loads on its own.
const run = (call: string): Cube[] => {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "import panels",
    "face = {'uv': [0, 0], 'uv_size': [8, 8]}",
    `print(json.dumps(${call}))`,
  ].join("\n");
  return JSON.parse(
    execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }),
  );
};

describe("panel_ring", () => {
  const ring = (radius: number, sides: number, thickness: number) =>
    run(`panels.panel_ring(${radius}, 0, 1, face, ${sides}, ${thickness})`);

  it("turns every panel about Y only and stays near the ring", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 4, max: 24 }),
        fc.integer({ min: 1, max: 8 }).map((v) => v / 4),
        (radius, sides, thickness) => {
          const cubes = ring(radius, sides, thickness);
          expect(cubes).toHaveLength(sides);
          for (const cube of cubes) {
            const [rx, , rz] = cube.rotation as Vec;
            expect(rx).toBe(0);
            expect(rz).toBe(0);
            const [, y] = cube.rotation as Vec;
            const t = (y * Math.PI) / 180;
            const pivot = cube.pivot as Vec;
            const [cx, , cz] = [cube.origin[0], 0, cube.origin[2]];
            const corners = [0, 1].flatMap((i) =>
              [0, 1].map((j) => {
                const dx = cx + i * cube.size[0] - pivot[0];
                const dz = cz + j * cube.size[2] - pivot[2];
                return Math.hypot(
                  dx * Math.cos(t) + dz * Math.sin(t),
                  -dx * Math.sin(t) + dz * Math.cos(t),
                );
              }),
            );
            for (const reach of corners)
              expect(reach).toBeLessThanOrEqual(
                radius / Math.cos(Math.PI / sides) + thickness + 0.1,
              );
          }
        },
      ),
    );
  });

  it("closes the ring: neighbouring panels are wider than one polygon edge", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 4, max: 24 }),
        (radius, sides) => {
          const [first] = ring(radius, sides, 0.5) as [Cube];
          const edge = 2 * radius * Math.tan(Math.PI / sides);
          expect(first.size[0]).toBeGreaterThan(edge);
        },
      ),
    );
  });

  it("is identical across two calls and honors the center", () => {
    expect(ring(3, 16, 0.5)).toEqual(ring(3, 16, 0.5));
    const moved = run("panels.panel_ring(3, 0, 1, face, 8, 0.5, (2, -1))");
    expect(moved.every((c) => c.pivot?.[0] === 2 && c.pivot?.[2] === -1)).toBe(
      true,
    );
  });
});

describe("disc", () => {
  it("builds Y-turned bars with the given face", () => {
    const bars = run("panels.disc(3, 0, 1, face, 8)");
    expect(bars).toHaveLength(8);
    for (const bar of bars) {
      expect(bar.rotation?.[0]).toBe(0);
      expect(bar.rotation?.[2]).toBe(0);
      expect(bar.uv.north).toEqual(FACE);
    }
    expect(run("panels.disc(3, 0, 1, face, 8)")).toEqual(bars);
  });
});

const domeDimensions = fc.integer({ min: 1, max: 12 }).chain((radius) =>
  fc.record({
    radius: fc.constant(radius),
    height: fc.integer({ min: 2, max: radius * 4 }).map((v) => v / 4),
    y0: fc.integer({ min: -40, max: 40 }).map((v) => v / 4),
    sides: fc.integer({ min: 4, max: 24 }),
    bands: fc.integer({ min: 2, max: 8 }),
  }),
);

describe("dome", () => {
  it("closes decreasing latitude rings with a positive cap using only Y turns", () => {
    fc.assert(
      fc.property(domeDimensions, ({ radius, height, y0, sides, bands }) => {
        const cubes = run(
          `panels.dome(${radius}, ${height}, ${y0}, face, ${sides}, ${bands})`,
        );
        expect(cubes).toHaveLength((bands - 1) * sides + 8);
        for (const cube of cubes) {
          expect(cube.rotation?.[0]).toBe(0);
          expect(cube.rotation?.[2]).toBe(0);
          expect(cube.pivot).toEqual([0, 0, 0]);
          expect(cube.uv.north).toEqual(FACE);
          for (const size of cube.size) expect(size).toBeGreaterThan(0);
          // Y turns preserve horizontal distance, so local corners give the rotated reach.
          for (const x of [0, 1]) {
            for (const z of [0, 1]) {
              expect(
                Math.hypot(
                  cube.origin[0] + x * cube.size[0],
                  cube.origin[2] + z * cube.size[2],
                ),
              ).toBeLessThanOrEqual(radius / Math.cos(Math.PI / sides) + 0.08);
            }
          }
        }
        const cap = cubes.slice((bands - 1) * sides);
        const firstCap = cap[0] as Cube;
        const capRadius = firstCap.size[0] / 2;
        let previousTop = y0;
        let previousApothem = Number.POSITIVE_INFINITY;
        for (let k = 0; k < bands - 1; k++) {
          const ring = cubes.slice(k * sides, (k + 1) * sides);
          const first = ring[0] as Cube;
          const apothem = -first.origin[2];
          const top = first.origin[1] + first.size[1];
          expect(apothem).toBeLessThan(previousApothem);
          expect(apothem).toBeCloseTo(
            radius * Math.cos((k * Math.PI) / (2 * bands)),
            4,
          );
          expect(top).toBeCloseTo(
            y0 + height * Math.sin(((k + 1) * Math.PI) / (2 * bands)),
            4,
          );
          for (const cube of ring) {
            expect(cube.origin[1]).toBeCloseTo(previousTop, 10);
            expect(cube.origin[1] + cube.size[1]).toBeCloseTo(top, 10);
            expect(cube.origin[2]).toBe(first.origin[2]);
            expect(cube.size[2]).toBe(first.size[2]);
          }
          const nextApothem =
            k === bands - 2
              ? capRadius
              : -(cubes[(k + 1) * sides] as Cube).origin[2];
          expect(apothem - first.size[2]).toBeLessThanOrEqual(nextApothem);
          previousTop = top;
          previousApothem = apothem;
        }
        expect(capRadius).toBeLessThan(previousApothem);
        expect(capRadius).toBeCloseTo(
          radius * Math.cos(((bands - 1) * Math.PI) / (2 * bands)),
          4,
        );
        expect(
          Math.min(...cap.map((cube) => cube.origin[1])),
        ).toBeLessThanOrEqual(previousTop + 1e-10);
        expect(
          Math.max(...cap.map((cube) => cube.origin[1] + cube.size[1])),
        ).toBeCloseTo(y0 + height, 10);
        for (const cube of cap) {
          expect(cube.size[1]).toBeGreaterThanOrEqual(0.06 - 1e-10);
        }
      }),
    );
  });
});

describe("panel centers", () => {
  it("translates every dome and disc origin and pivot while preserving shape", () => {
    fc.assert(
      fc.property(
        domeDimensions,
        fc.tuple(
          fc.integer({ min: -100, max: 100 }).map((v) => v / 4),
          fc.integer({ min: -100, max: 100 }).map((v) => v / 4),
        ),
        fc.integer({ min: 2, max: 16 }),
        ({ radius, height, y0, sides, bands }, [cx, cz], bars) => {
          const calls = [
            `panels.dome(${radius}, ${height}, ${y0}, face, ${sides}, ${bands}`,
            `panels.disc(${radius}, ${y0}, ${y0 + height}, face, ${bars}`,
          ];
          const results = run(
            calls
              .flatMap((call) => [`${call})`, `${call}, (${cx}, ${cz}))`])
              .join(" + "),
          );
          let offset = 0;
          for (const count of [(bands - 1) * sides + 8, bars]) {
            const original = results.slice(offset, offset + count);
            const moved = results.slice(offset + count, offset + 2 * count);
            offset += 2 * count;
            expect(moved).toHaveLength(original.length);
            original.forEach((cube, i) => {
              const translated = moved[i] as Cube;
              expect(translated.uv).toEqual(cube.uv);
              expect(translated.rotation).toEqual(cube.rotation);
              for (const axis of [0, 1, 2] as const) {
                const shift = [cx, 0, cz][axis] as number;
                expect(translated.origin[axis]).toBeCloseTo(
                  cube.origin[axis] + shift,
                  10,
                );
                expect((translated.pivot as Vec)[axis]).toBeCloseTo(
                  (cube.pivot as Vec)[axis] + shift,
                  10,
                );
                expect(translated.size[axis]).toBeCloseTo(cube.size[axis], 10);
              }
            });
          }
        },
      ),
    );
  });
});

describe("camping gear generator with turned cubes", () => {
  const gear = (code: string) => {
    const script = [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "import gen_camping_gear as g",
      code,
    ].join("\n");
    return execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" });
  };

  it("bounds follows a Y turn about an off-center pivot", () => {
    // 30 degrees about pivot x=1 is not symmetric: a flipped sign or a turn about the origin gives other extents.
    const out = gear(
      "cube = {'origin': [-2, 0, -1], 'size': [4, 1, 2], 'pivot': [1, 0, 0], 'rotation': [0, 30, 0], 'uv': {}}\nprint(json.dumps(g.bounds([cube])))",
    );
    const [lo, hi] = JSON.parse(out) as [number[], number[]];
    const expected = [-2.098076, 0, -1.366025, 2.366025, 1, 2.366025];
    [...lo, ...hi].forEach((value, i) => {
      expect(value).toBeCloseTo(expected[i] ?? Number.NaN, 5);
    });
  });

  it("moves the pivot with the origin for a pair end", () => {
    const out = gear(
      "cube = {'origin': [-2, 0, -1], 'size': [4, 1, 2], 'pivot': [0, 0, 0], 'rotation': [0, 90, 0], 'uv': {}}\nprint(json.dumps(g.moved(cube, 3, 5)))",
    );
    expect(JSON.parse(out)).toMatchObject({
      origin: [-5, 0, -6],
      pivot: [-3, 0, -5],
    });
  });

  it("rejects a two-axis cube in validate()", () => {
    const code = [
      "spec = json.loads(g.SPEC.read_text())[:1]",
      "bad = g.box(-1, 0, -1, 1, 1, 1, 'cream')",
      "bad.update(pivot=[0, 0, 0], rotation=[10, 20, 0])",
      "g.SHAPES = {spec[0]['id']: [bad]}",
      "g.validate(spec)",
    ].join("\n");
    expect(() => gear(code)).toThrow(/compound rotation/);
  });
});
