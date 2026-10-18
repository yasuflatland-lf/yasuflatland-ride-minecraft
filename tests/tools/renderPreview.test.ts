import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Point = [number, number, number];

// Runs collect_boat from tools/render_preview.py on a geometry and returns the
// center of every opaque face it draws, in the preview's mirrored frame.
const faceCenters = (geometry: unknown): Point[] => {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "import render_preview",
    "geo = json.loads(sys.stdin.read())",
    "pose = {'lamps': False, 'dusk': False}",
    "polygons, _ = render_preview.collect_boat(geo, [[(255, 255, 255, 255)]], pose)",
    "print(json.dumps([[sum(p[i] for p in quad) / len(quad) for i in range(3)] for quad, _, _ in polygons]))",
  ].join("\n");
  const out = execFileSync("python3", ["-I", "-c", script], {
    input: JSON.stringify(geometry),
    encoding: "utf8",
  });
  return JSON.parse(out);
};

const face = { uv: [0, 0], uv_size: [1, 1] };
const uv = Object.fromEntries(
  ["north", "south", "east", "west", "up", "down"].map((f) => [f, face]),
);
// A 1 px bar along -z whose north face is centered on (0, y, z).
const bar = (y: number, z: number, length: number) => ({
  origin: [-0.5, y - 0.5, z],
  size: [1, 1, length],
  uv,
});

const LEAN = 50;
const PIVOT_Y = 10;
const geometry = {
  description: { texture_width: 1, texture_height: 1 },
  bones: [
    { name: "body", pivot: [0, 0, 0], cubes: [bar(0, -5, 1)] },
    {
      name: "steering",
      parent: "body",
      pivot: [0, PIVOT_Y, 0],
      rotation: [LEAN, 0, 0],
      cubes: [bar(PIVOT_Y, -10, 10)],
    },
    {
      name: "rim",
      parent: "steering",
      pivot: [0, 0, 0],
      cubes: [bar(PIVOT_Y, -21, 1)],
    },
  ],
};

const expectNear = (centers: Point[], [x, y, z]: Point) => {
  const nearest = Math.min(
    ...centers.map(([cx, cy, cz]) => Math.hypot(cx - x, cy - y, cz - z)),
  );
  expect(nearest, `a face centered on ${[x, y, z]}`).toBeLessThan(1e-6);
};

describe("render_preview.py bone rotations", () => {
  const centers = faceCenters(geometry);
  const s = Math.sin((LEAN * Math.PI) / 180);
  const c = Math.cos((LEAN * Math.PI) / 180);

  it("turns a rotated bone's cubes about its pivot the way the game does", () => {
    // In game a positive x rotation lays the steering column's front end down
    // toward the dashboard, as on a bus.
    expectNear(centers, [0, PIVOT_Y - 10 * s, -10 * c]);
  });

  it("carries a parent bone's rotation to its child bones", () => {
    expectNear(centers, [0, PIVOT_Y - 21 * s, -21 * c]);
  });

  it("leaves bones outside the rotated chain where they are", () => {
    expectNear(centers, [0, 0, -5]);
  });
});
