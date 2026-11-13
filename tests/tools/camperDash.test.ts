import { readFileSync } from "node:fs";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Triple, turn, turnedCorners } from "../support/geometry";
import { startPythonWorker } from "../support/pythonWorker";

type Face = { uv: number[]; uv_size: number[] };
type Cube = {
  origin: Triple;
  size: Triple;
  pivot?: Triple;
  rotation?: Triple;
  uv: Record<string, Face>;
};
type Region = { name: string; origin: number[]; size: number[] };
type Dash = {
  cubes: Cube[];
  fittings: Cube[];
  geometry: { face_origin: Triple; face_normal: Triple; shelf_y: number };
  regions: Region[];
  black: number[];
};
const python = startPythonWorker();
afterAll(() => python.close());
let dash: Dash;
beforeAll(async () => {
  dash = JSON.parse(
    await python.run(`import json, sys
from dataclasses import asdict
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_dash')
kit = load_tool('camper_kit')
area = m.build_dash(kit.REGISTRY)
print(json.dumps(dict(cubes=area['body'], fittings=m.DashBuilder(kit.REGISTRY).fittings(), geometry=asdict(m.DASH_GEOMETRY), regions=[dict(name=r.name, origin=kit.LAYOUT.origin(r.name), size=[r.width,r.height]) for r in kit.REGISTRY.regions()], black=kit.ATLAS.face('black')['uv'])))`),
  );
});
const sub = (a: Triple, b: Triple): Triple => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: Triple, b: Triple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const regionFor = (face: Face) =>
  dash.regions.find((r) => {
    const [u = 0, v = 0] = face.uv;
    const [w = 0, h = 0] = face.uv_size;
    const [x = 0, y = 0] = r.origin;
    return (
      Math.min(u, u + w) >= x &&
      Math.max(u, u + w) <= x + (r.size[0] ?? 0) &&
      Math.min(v, v + h) >= y &&
      Math.max(v, v + h) <= y + (r.size[1] ?? 0)
    );
  });
const rotated = (cube: Cube, p: Triple) =>
  turn(p, cube.pivot ?? [0, 0, 0], cube.rotation ?? [0, 0, 0]);

// Slabs are measured in each cube's local axes, including oblique end-cap pieces.
const prepare = (cube: Cube) => {
  const zero = rotated(cube, [0, 0, 0]);
  const axes = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Triple[]
  ).map((p) => sub(rotated(cube, p), zero));
  return {
    axes,
    lo: cube.origin.map((v, i) => v + dot(zero, axes[i] as Triple)),
    size: cube.size,
  };
};
const hit = (eye: Triple, target: Triple, box: ReturnType<typeof prepare>) => {
  let lo = 0,
    hi = 1.00001;
  const direction = sub(target, eye);
  for (let i = 0; i < 3; i++) {
    const axis = box.axes[i] as Triple;
    const start = dot(eye, axis),
      velocity = dot(direction, axis);
    const min = box.lo[i] ?? 0,
      max = min + (box.size[i] ?? 0);
    if (Math.abs(velocity) < 1e-10) {
      if (start < min || start > max) return false;
    } else {
      const a = (min - start) / velocity,
        b = (max - start) / velocity;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
      if (lo > hi) return false;
    }
  }
  return hi > 0 && lo < 1.00001;
};

describe("camper shallow dash", () => {
  it("keeps instrument pixels identical when libm results move by one ulp", async () => {
    expect(
      JSON.parse(
        await python.run(`import json, math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_dash')
kit = load_tool('camper_kit')
m.PAL = kit.PALETTE
expected = m.instrument_images()
functions = {name: getattr(math, name) for name in ('sin', 'cos', 'hypot')}
results = []
try:
    for direction in (-math.inf, math.inf):
        for name, function in functions.items():
            setattr(math, name, lambda *args, f=function, d=direction: math.nextafter(f(*args), d))
        results.append(m.instrument_images() == expected)
finally:
    for name, function in functions.items():
        setattr(math, name, function)
print(json.dumps(results))`),
      ),
    ).toEqual([true, true]);
  });

  it("merges equivalent rotated strips despite one-ulp pivot and rotation differences", async () => {
    expect(
      JSON.parse(
        await python.run(`import json, math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_dash')
kit = load_tool('camper_kit')
from copy import deepcopy
builder = m.DashBuilder(kit.REGISTRY)
a = builder.box(0, 1, 2, 1, 3, 4, 'dash')
a.update(pivot=[0, 1.25, 2.5], rotation=[30.0, 0, 0])
results = []
for direction in (-math.inf, math.inf):
    b = deepcopy(a)
    b['origin'][0] = 1
    b['pivot'][1] = math.nextafter(b['pivot'][1], direction)
    b['rotation'][0] = math.nextafter(b['rotation'][0], direction)
    merged = m.tile_mass([deepcopy(a), b])
    results.append([len(merged), merged[0]['size'][0]])
    b['rotation'][0] = 30.000001
    results.append([len(m.tile_mass([deepcopy(a), b]))])
print(json.dumps(results))`),
      ),
    ).toEqual([[1, 2], [2], [1, 2], [2]]);
  });

  it("preserves every occupied cell when sweeping overlapping uniform cores", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.integer({ min: -3, max: 3 }),
            fc.integer({ min: -3, max: 3 }),
            fc.integer({ min: 1, max: 4 }),
            fc.integer({ min: 1, max: 4 }),
          ),
          { minLength: 1, maxLength: 10 },
        ),
        async (rectangles) => {
          const result = await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m=load_tool('camper_dash')
cs=[dict(origin=[x,0,z],size=[w,1,d],uv={'north':{'uv':[0,0],'uv_size':[1,1]}}) for x,z,w,d in ${JSON.stringify(rectangles)}]
def occupied(cubes):
    return {(x,z) for x in range(-3,8) for z in range(-3,8) if any(c['origin'][0] <= x+.5 < c['origin'][0]+c['size'][0] and c['origin'][2] <= z+.5 < c['origin'][2]+c['size'][2] for c in cubes)}
print(json.dumps(occupied(cs)==occupied(m.tile_mass(cs))))`);
          expect(JSON.parse(result)).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("keeps the dark core tops below the shelf in 28 lossless strips", async () => {
    const result = await python.run(`import sys, json
sys.path.insert(0, 'tools')
from tool_loader import load_tool
kit = load_tool('camper_kit')
dash = load_tool('camper_dash')
cs = dash.build_dash(kit.REGISTRY)['body']
print(json.dumps(len([c for c in cs if not c.get('rotation') and abs(c['origin'][1]+c['size'][1]-34.89999)<1e-7])))`);
    expect(JSON.parse(result)).toBe(28);
  });

  it("keeps the instrument normals parallel to the sloping face within half a degree", () => {
    const instruments = dash.fittings.filter((c) => {
      const face = c.uv.south;
      return c.rotation && face && regionFor(face)?.name !== "cab SMALL";
    });
    expect(instruments).toHaveLength(26);
    const normal = dash.geometry.face_normal;
    expect((Math.atan2(normal[1], normal[2]) * 180) / Math.PI).toBeCloseTo(
      57.5,
      0,
    );
    for (const cube of instruments) {
      const actual = sub(rotated(cube, [0, 0, 1]), rotated(cube, [0, 0, 0]));
      const degrees =
        (Math.acos(Math.min(1, dot(actual, normal))) * 180) / Math.PI;
      expect(degrees, JSON.stringify(cube.origin)).toBeLessThanOrEqual(0.5);
      const center = rotated(cube, cube.origin);
      const distance = dot(sub(center, dash.geometry.face_origin), normal);
      expect(distance).toBeGreaterThanOrEqual(-0.01);
      expect(distance).toBeLessThan(0.5);
      for (const corner of turnedCorners({ name: "body" }, cube)) {
        expect(Math.abs(corner[0])).toBeLessThanOrEqual(23.25);
        expect(corner[1]).toBeGreaterThanOrEqual(32.2899);
        expect(corner[1]).toBeLessThanOrEqual(35);
      }
    }
  });

  it("keeps every dash cube below the windshield sill, with a shelf at y35", () => {
    expect(dash.cubes.length).toBeGreaterThan(100);
    expect(dash.geometry.shelf_y).toBe(35);
    let shelf = 0;
    for (const cube of dash.cubes) {
      const top = Math.max(
        ...turnedCorners({ name: "body" }, cube).map((p) => p[1]),
      );
      expect(top, JSON.stringify(cube.origin)).toBeLessThanOrEqual(35.0001);
      if (!cube.rotation && Math.abs(top - 35) < 1e-6 && cube.size[2] > 2)
        shelf++;
    }
    expect(shelf).toBeGreaterThan(0);
  });

  it("hangs the lower gauges at 35 degrees below the six-button cluster", () => {
    const lower = dash.cubes.find(
      (c) => c.uv.south && regionFor(c.uv.south)?.name === "cab SMALL",
    );
    expect(lower).toBeDefined();
    expect(lower?.rotation).toEqual([35, 0, 0]);
    const buttons = dash.cubes.filter(
      (c) => c.size[0] === 0.32 && c.size[1] === 0.32 && c.size[2] === 0.25,
    );
    expect(buttons).toHaveLength(6);
    const middle =
      buttons.reduce((sum, c) => sum + c.origin[0] + c.size[0] / 2, 0) /
      buttons.length;
    expect(middle).toBeCloseTo(3.523374167805887, 6);
    expect((lower?.origin[0] ?? 0) + (lower?.size[0] ?? 0) / 2).toBeCloseTo(
      middle,
      6,
    );
  });

  it("uses green material for the dash mass instead of black palette slabs", () => {
    const masses = dash.cubes.filter(
      (cube) => cube.size[0] * cube.size[1] * cube.size[2] > 1,
    );
    expect(masses.length).toBeGreaterThan(10);
    for (const cube of masses)
      for (const face of Object.values(cube.uv)) {
        expect(face.uv, JSON.stringify(cube.origin)).not.toEqual(dash.black);
      }
  });

  it("closes the passenger end without ray leaks through the solid dash envelope", () => {
    const model = JSON.parse(
      readFileSync(
        "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
        "utf8",
      ),
    ) as {
      "minecraft:geometry": { bones: { name: string; cubes?: Cube[] }[] }[];
    };
    const area = (
      JSON.parse(
        readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
      ) as { cab: { body: [number, number] | [number, number][] } }
    ).cab.body;
    const ranges =
      typeof area[0] === "number"
        ? [area as [number, number]]
        : (area as [number, number][]);
    const body =
      model["minecraft:geometry"][0]?.bones.find((b) => b.name === "body")
        ?.cubes ?? [];
    const shipped = ranges.flatMap(([first, last]) =>
      body.slice(first, last + 1),
    );
    expect(shipped.length).toBeGreaterThan(0);
    // These independent section datums come from the approved cab profile; they
    // include the shelf seam and the thin cap at the passenger side wall.
    const topZ = -50.59285714285714;
    const slope = 100 / 157;
    const axis = (y: number) => -44.7 + (y - 35.2) / Math.sqrt(3);
    const endY =
      (topZ + 35 / slope + 44.7 + 35.2 / Math.sqrt(3)) /
      (1 / slope + 1 / Math.sqrt(3));
    const eyes: Triple[] = [
      [-40, 38, -45],
      [-25, 57, -48],
      [-35, 40, -67],
      [-34, 23, -35],
      [-40, 34, -49],
      [40, 38, -45],
      [12.5, 44, -35],
    ];
    const targets: Triple[] = [];
    for (const x of [-23.24, -23.205, -23.19, -22.91, -22.89])
      for (const y of [
        23, 25, 27, 29, 31, 32.3, 34.85, 34.9, 34.93, 34.97, 34.99,
      ]) {
        const front =
          -61.738 +
          22.95 * Math.tan((8 * Math.PI) / 180) +
          0.15 * (34.05 - y) +
          5.7;
        const rear = y < endY ? axis(y) : topZ + (35 - y) / slope;
        for (let i = 0; i <= 8; i++)
          targets.push([x, y, front + 0.02 + ((rear - front - 0.04) * i) / 8]);
      }
    for (const [label, cubes] of [
      ["source", dash.cubes],
      ["shipped", shipped],
    ] as const) {
      const boxes = cubes.map(prepare);
      // The shipped model mirrors x, so mirror the rays to keep testing the passenger side.
      const frame = (point: Triple): Triple =>
        label === "shipped" ? [-point[0], point[1], point[2]] : point;
      const leaks: unknown[] = [];
      for (const eye of eyes)
        for (const target of targets)
          if (!boxes.some((box) => hit(frame(eye), frame(target), box)))
            leaks.push({ eye, target });
      expect(targets.length).toBeGreaterThan(400);
      expect(leaks.slice(0, 5), label).toEqual([]);
      expect(leaks, label).toHaveLength(0);
    }
  });
});
