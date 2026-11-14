import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

// The first request also initializes the camper's shared material registry.
it("builds two 40-cube panels and a rail for each of five windows", async () => {
  const result = JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_curtains')
k = load_tool('camper_kit')
cubes = m.build()['body']
region = next((r for r in k.REGISTRY.regions() if r.name == 'light curtain fabric'), None)
print(json.dumps([len(cubes), len(m.anchors()), len(m.make_panel(k.REGISTRY)), [region.width, region.height, region.material.value] if region else None, cubes == m.build()['body'], load_tool('camper_regions').CURTAIN_PIXELS == load_tool('camper_regions')._curtain_pixels()]))`),
  );
  expect(result).toEqual([405, 5, 40, [96, 120, "fabric"], true, true]);
}, 30_000);

it("keeps each window assembly within its opening and the allowed interior depth", async () => {
  const result = JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_curtains')
tilt = load_tool('cube_tilt')
cubes = m.build()['body']
results = []
for i, (_, _, z0, z1, _, _) in enumerate(m.windows()):
    group = cubes[i * 81:(i + 1) * 81]
    lo, hi = tilt.bounds(group)
    results.append([len(group), lo[2] >= z0, hi[2] <= z1, lo[0] >= -22.8, hi[0] <= 22.8, lo[1] > 35.4, hi[1] < 50])
print(json.dumps(results))`),
  );
  expect(result).toEqual(
    Array.from({ length: 5 }, () => [81, true, true, true, true, true, true]),
  );
});

it("puts each window group against its own wall and mirrors only the rear panels", async () => {
  const result = JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_curtains')
cubes = m.build()['body']
out = []
for i, (x0, x1, z0, z1, _, _) in enumerate(m.windows()):
    group = cubes[i * 81:(i + 1) * 81]
    xs = [c['origin'][0] + c['size'][0] / 2 for c in group[:80]]
    side = all((x > 0) == (x0 > 0) and abs(x) >= 21.7 for x in xs)
    sizes = [[group[k]['uv'][f]['uv_size'][0] for f in ('east', 'west')] for k in (0, 40)]
    out.append([side, sizes[0][0] > 0 and sizes[0][1] > 0, sizes[1][0] < 0 and sizes[1][1] < 0])
print(json.dumps(out))`),
  );
  expect(result).toEqual(Array.from({ length: 5 }, () => [true, true, true]));
});

it("keeps a panel inside its span with 40 cubes for any window length", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 10, max: 30 }),
      fc.constantFrom(1, -1),
      async (span, direction) => {
        const [count, lo, hi] = JSON.parse(
          await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_curtains')
k = load_tool('camper_kit')
t = load_tool('cube_tilt')
cubes = m.make_panel(k.REGISTRY, 1, 0, ${direction}, ${span})
lo, hi = t.bounds(cubes)
print(json.dumps([len(cubes), lo[2], hi[2]]))`),
        ) as number[];
        expect(count).toBe(40);
        expect(lo).toBeGreaterThanOrEqual((direction === 1 ? 0 : -span) - 1e-6);
        expect(hi).toBeLessThanOrEqual((direction === 1 ? span : 0) + 1e-6);
      },
    ),
    { numRuns: 8 },
  );
});
