import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k = load_tool('camper_kitchen')
r = load_tool('region_atlas')
`;

it("audits the texture atlas built for the kitchen faces", async () => {
  const result = JSON.parse(
    await python.run(`${setup}
registry = r.RegionRegistry()
k.build_kitchen_top(registry)
layout = registry._layout
print(json.dumps(r.audit(layout, r.render_atlas(layout))))`),
  );
  expect(result).toEqual([]);
});

it("translates and turns the burner about its requested centre without closing its bore", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 10, max: 20 }),
      fc.integer({ min: 25, max: 38 }),
      fc.integer({ min: -180, max: 180 }),
      async (cx, cz, turn) => {
        const result = JSON.parse(
          await python.run(`${setup}
import math
from collections import Counter
from itertools import product
tilt = load_tool('cube_tilt')
cubes = k.burner(${cx}, ${cz}, ${turn})
lo, hi = tilt.bounds(cubes)
# The generator returns the mirrored build frame, which reverses the input yaw.
angle = math.radians(-${turn})
def turn_point(point):
    x, y, z = point
    dx, dz = x-${cx}, z-${cz}
    return (${cx} + dx*math.cos(angle) + dz*math.sin(angle),
            y, ${cz} - dx*math.sin(angle) + dz*math.cos(angle))
def corners(cube):
    pivot = cube['pivot']
    matrix = tilt.cube_matrix(cube['rotation'])
    for bits in product((0, 1), repeat=3):
        offset = [cube['origin'][i] + bits[i]*cube['size'][i] - pivot[i] for i in range(3)]
        yield [a+b for a,b in zip(pivot, tilt.apply_matrix(matrix, offset))]
def corner_counts(points):
    return Counter(tuple(round(v, 6) for v in point) for point in points)
turned = corner_counts(point for cube in cubes for point in corners(cube))
expected = corner_counts(turn_point(point) for cube in k.burner(${cx}, ${cz}, 0)
                         for point in corners(cube))
def covers_bore(c):
    pivot = c['pivot']
    matrix = tilt.cube_matrix(c['rotation'])
    point = [${cx},30.6,${cz}]
    local = [pivot[i]+sum(matrix[j][i]*(point[j]-pivot[j]) for j in range(3)) for i in range(3)]
    return all(c['origin'][i] < local[i] < c['origin'][i]+c['size'][i] for i in range(3))
print(json.dumps([hi[1], [lo[0]-${cx}, hi[0]-${cx}], [lo[2]-${cz}, hi[2]-${cz}], not any(covers_bore(c) for c in cubes), turned == expected]))`),
        );
        const [top, xSpan, zSpan, openBore, rigidYaw] = result as [
          number,
          [number, number],
          [number, number],
          boolean,
          boolean,
        ];
        expect(top).toBeCloseTo(30.95);
        for (const [low, high] of [xSpan, zSpan]) {
          expect(low).toBeLessThan(0);
          expect(high).toBeGreaterThan(0);
          expect(low).toBeGreaterThan(-1.73);
          expect(high).toBeLessThan(1.73);
        }
        expect(openBore).toBe(true);
        expect(rigidYaw).toBe(true);
      },
    ),
    { numRuns: 12 },
  );
});

it("maps the cast cup sides to a dark patch and keeps the taller head ring open", async () => {
  const result = JSON.parse(
    await python.run(`${setup}
kit = load_tool('camper_kit')
cubes = k.burner(16,32,0)
cast = [c for c in cubes if abs(c['origin'][1]-30.06) < 1e-6]
head = [c for c in cubes if abs(c['origin'][1]-30.515) < 1e-6]
print(json.dumps([len(cast),len(head),all(c['uv']['north'] == kit.ATLAS.face(kit.BURNER_CAST_REGION) for c in cast),all(abs(c['size'][1]-.22)<1e-6 for c in head)]))`),
  );
  const [castCount, headCount, darkCup, raisedRing] = result;
  expect(castCount).toBeGreaterThan(0);
  expect(headCount).toBeGreaterThan(0);
  expect(darkCup).toBe(true);
  expect(raisedRing).toBe(true);
});
