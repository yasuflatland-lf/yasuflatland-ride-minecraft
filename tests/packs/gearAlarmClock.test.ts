import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds a painted twin-bell clock with registered tilts and three floor contacts", async () => {
  expect(
    await python.run(`
import json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
registry = load_tool('gear_registry')
atlas = load_tool('gear_atlas')
validation = load_tool('gear_validate')
tilt = load_tool('cube_tilt')
model = registry.build('alarm_clock')
item = registry.assemblies('alarm_clock')
assert 150 < len(model.cubes) <= validation.MAX_CUBES_PER_ITEM
assert 2 * len(model.cubes) <= validation.MAX_CUBES_PER_PAIR_BLOCK
assert item and set(item) == set(model.assemblies)
assert all(name.startswith('alarm_clock_') and entry['owner'] == 'camping_gear'
           and entry['cubes'] == len(model.assemblies[name]) for name, entry in item.items())
tilt.assert_axes(model.cubes, model.assemblies, item)
assert not validation.rotation_errors('alarm_clock', model.cubes)
assert any(tilt.axis_count(c) == 2 for c in model.cubes)
lo, hi = tilt.bounds(model.cubes)
assert abs(lo[0] + hi[0]) < .001 and -2.1 <= lo[0] <= -2 and 2 <= hi[0] <= 2.1
assert lo[1] == 0 and hi[1] == 5 and hi[1] <= 9 and hi[1] <= 12
assert abs(lo[2] + hi[2]) < .001 and lo[2] >= -1 and hi[2] <= 1
assert all(all(s > 0 for s in c['size']) for c in model.cubes)
case = model.assemblies['alarm_clock_case']
legs = model.assemblies['alarm_clock_legs']
assert tilt.bounds(case[20:40])[0][1] == 0
assert tilt.bounds(legs[:10])[0][1] == 0
assert tilt.bounds(legs[10:])[0][1] == 0
assert atlas.GEAR_TILES['alarm_clock'] == 11
regions = [t for t in atlas.tiles() if t.item_id == 'alarm_clock']
assert regions and model.texture_request == ('alarm_clock',)
assert all(t.get(x, y)[3] in (0, 255) for t in regions
           for y in range(t.height) for x in range(t.width))
assert any(all(t.get(x, y)[3] == 255 for y in range(t.height) for x in range(t.width))
           for t in regions)
assert not atlas.check_alpha('alarm_clock', False)
assert not validation.uv_errors('alarm_clock', model.cubes, atlas.GEAR_TILES)
assert validation.sampled_alphas(model.cubes, atlas.atlas_pixels(), atlas.ATLAS_SIZE) == {0, 255}
spec = json.loads(Path('tools/camping_gear.json').read_text())
assert not next(i for i in spec if i['id'] == 'alarm_clock')['glass']
geometry = json.loads(Path('packs/yasu_ride_rp/models/blocks/yasu_ride/alarm_clock.geo.json').read_text())['minecraft:geometry'][0]
shipped = [c for b in geometry['bones'] for c in b.get('cubes', [])]
assert len(shipped) == len(model.cubes)
assert not validation.rotation_errors('alarm_clock', shipped)
shipped_lo, shipped_hi = tilt.bounds(shipped)
assert abs(shipped_lo[1]) < .001 and abs(shipped_hi[1] - 5) < .001
png = load_tool('render_preview').read_png(Path('packs/yasu_ride_rp/textures/blocks/yasu_ride/camping_gear.png'))
pixels = bytes(v for row in png for pixel in row for v in pixel)
assert validation.sampled_alphas(shipped, pixels, atlas.ATLAS_SIZE) == {0, 255}
for kind in ('shelf', 'table', 'cabinet', 'fridge'):
    pair = json.loads(Path(f'packs/yasu_ride_rp/models/blocks/yasu_ride/{kind}_decor_pair.geo.json').read_text())['minecraft:geometry'][0]
    for end in range(2):
        bone = next(b for b in pair['bones'] if b['name'] == f'end{end}_alarm_clock')
        assert len(bone['cubes']) == len(model.cubes)
        pair_lo, pair_hi = tilt.bounds(bone['cubes'])
        assert all(-8 <= pair_lo[i] <= pair_hi[i] <= 8 for i in (0, 2))
        assert abs(pair_lo[1]) < .001 and abs(pair_hi[1] - 5) < .001
        assert validation.sampled_alphas(bone['cubes'], pixels, atlas.ATLAS_SIZE) == {0, 255}
print('ok')
`),
  ).toBe("ok\n");
});
