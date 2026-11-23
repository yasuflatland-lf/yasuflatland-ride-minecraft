import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const setup = `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_curtains')
k = load_tool('camper_kit')
t = load_tool('cube_tilt')
`;

it("builds repeatable curtain assemblies from the registered fabric", async () => {
  const result = JSON.parse(
    await python.run(`${setup}
regions = load_tool('camper_regions')
cubes = m.build()['body']
region = next(r for r in k.REGISTRY.regions() if r.name == 'light curtain fabric')
print(json.dumps([len(m.anchors()), region.material.value, cubes == m.build()['body'],
                  regions.CURTAIN_PIXELS == regions._curtain_pixels()]))`),
  );
  expect(result).toEqual([5, "fabric", true, true]);
});

it("fits a rail and two inward-facing panels in each window, flipping the rear fabric", async () => {
  const result = JSON.parse(
    await python.run(`${setup}
cubes = m.build()['body']
windows = list(m.windows())
assigned = set()
for x0, x1, z0, z1, _, _ in windows:
    group = [(i,c) for i,c in enumerate(cubes)
             if (c['origin'][0] > 0) == (x0 > 0)
             and z0 <= c['origin'][2] + c['size'][2]/2 <= z1]
    assert group, (x0, z0, z1)
    assert assigned.isdisjoint(i for i,_ in group)
    assigned.update(i for i,_ in group)
    parts = [c for _,c in group]
    lo, hi = t.bounds(parts)
    assert lo[2] >= z0 and hi[2] <= z1, (lo, hi, z0, z1)
    assert lo[0] >= -22.8 and hi[0] <= 22.8, (lo, hi)
    assert lo[1] > 35.4 and hi[1] < 50, (lo, hi)
    rails = [c for c in parts if k.ATLAS.face('aluminium') in c['uv'].values()]
    rail_lo, rail_hi = t.bounds(rails)
    assert abs(rail_lo[2]-z0) < 1e-6 and abs(rail_hi[2]-z1) < 1e-6
    panels = {1: [], -1: []}
    for c in parts:
        faces = [c['uv'].get(side) for side in ('east', 'west')]
        if not all(f and k.LAYOUT.face_region(f) == 'light curtain fabric' for f in faces):
            continue
        x = c['origin'][0] + c['size'][0]/2
        assert abs(x) >= 21.7, x
        z = c['origin'][2] + c['size'][2]/2
        direction = 1 if z < (z0+z1)/2 else -1
        assert all(f['uv_size'][0]*direction > 0 for f in faces), faces
        panels[direction].append(c)
    assert all(panels.values()), (x0, z0, z1)
assert len(assigned) == len(cubes)
print(json.dumps(len(windows)))`),
  );
  expect(result).toBe(5);
});

it("keeps a panel inside its span for any window length", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 10, max: 30 }),
      fc.constantFrom(1, -1),
      async (span, direction) => {
        const [lo, hi] = JSON.parse(
          await python.run(`${setup}
cubes = m.make_panel(k.REGISTRY, 1, 0, ${direction}, ${span})
lo, hi = t.bounds(cubes)
print(json.dumps([lo[2], hi[2]]))`),
        ) as [number, number];
        expect(hi).toBeGreaterThan(lo);
        expect(lo).toBeGreaterThanOrEqual((direction === 1 ? 0 : -span) - 1e-6);
        expect(hi).toBeLessThanOrEqual((direction === 1 ? span : 0) + 1e-6);
      },
    ),
    { numRuns: 8 },
  );
});
