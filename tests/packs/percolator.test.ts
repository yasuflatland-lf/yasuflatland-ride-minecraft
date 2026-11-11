import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("keeps the percolator within budget with painted binary-alpha tiles and opaque body facets", async () => {
  const result = JSON.parse(
    await python.run(`
import json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
v = load_tool('gear_validate')
a = load_tool('gear_atlas')
r = load_tool('render_preview')
registry = load_tool('gear_registry')
model = registry.build('percolator')
tilt = load_tool('cube_tilt')
assert all(tilt.bounds([c])[1][0] < 0 for c in model.assemblies['percolator_spout'])
assert all(tilt.bounds([c])[1][0] < 0 and tilt.bounds([c])[1][2] < 0
           for c in model.assemblies['percolator_valve'])
assert min(tilt.bounds([c])[0][1] for c in model.cubes) == 0
atlas = a.atlas_pixels()
assert v.sampled_alphas(model.assemblies['percolator_lid'][:12], atlas, a.ATLAS_SIZE) == {255}
for c in model.assemblies['percolator_valve']:
    assert min(c['uv']['north']['uv_size']) >= 16
geo = json.loads(Path('packs/yasu_ride_rp/models/blocks/yasu_ride/percolator.geo.json').read_text())['minecraft:geometry'][0]
cubes = [c for b in geo['bones'] for c in b['cubes']]
texture = r.read_png(Path('packs/yasu_ride_rp/textures/blocks/yasu_ride/camping_gear.png'))
assert len(texture) == len(texture[0]) == a.ATLAS_SIZE
cell = a.GEAR_TILES['percolator']
assert cell == 1
x0, y0 = a.CELL*(cell%4), a.CELL*(cell//4)
cell_pixels = [tuple(texture[y][x]) for y in range(y0,y0+a.CELL) for x in range(x0,x0+a.CELL)]
pixels = bytes(channel for row in texture for pixel in row for channel in pixel)
# Loft facets paint one region on every side; cut-out panels give their edges a clear region.
body = [c for name in ('percolator_tank', 'percolator_pot', 'percolator_lid', 'percolator_knob')
        for c in model.assemblies[name] if c['uv']['up'] == c['uv']['north']]
assert len(body) >= 48 + 6 + 36
assert all(128 <= face['uv'][0] <= 256 for cube in body for face in cube['uv'].values())
print(json.dumps({'count':len(cubes), 'limit':v.MAX_CUBES_PER_ITEM,
                  'colors':len(set(cell_pixels)), 'alphas':sorted({p[3] for p in cell_pixels}),
                  'bodyAlphas':sorted(v.sampled_alphas(body,pixels,a.ATLAS_SIZE)),
                  'errors':v.uv_errors('percolator',cubes,a.GEAR_TILES)}))
`),
  );
  expect(result.count).toBeGreaterThan(0);
  expect(result.count).toBeLessThanOrEqual(result.limit);
  expect(result.colors).toBeGreaterThan(16);
  expect(result.alphas).toEqual([0, 255]);
  expect(result.bodyAlphas).toEqual([255]);
  expect(result.errors).toEqual([]);
});
