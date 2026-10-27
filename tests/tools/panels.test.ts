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

  it("bounds follows a Y turn about the pivot", () => {
    const out = gear(
      "cube = {'origin': [-2, 0, -1], 'size': [4, 1, 2], 'pivot': [0, 0, 0], 'rotation': [0, 90, 0], 'uv': {}}\nprint(json.dumps(g.bounds([cube])))",
    );
    expect(JSON.parse(out)).toEqual([
      [-1, 0, -2],
      [1, 1, 2],
    ]);
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
