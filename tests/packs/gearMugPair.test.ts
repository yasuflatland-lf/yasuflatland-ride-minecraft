import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("keeps the mug pair within budget with opaque painted faces and registered assemblies", async () => {
  expect(
    await python.run(`
import json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
registry = load_tool('gear_registry')
atlas = load_tool('gear_atlas')
validate = load_tool('gear_validate')
tilt = load_tool('cube_tilt')
generator = load_tool('gen_camping_gear')
model = registry.build('mug_pair')
assert 0 < len(model.cubes) <= validate.MAX_CUBES_PER_ITEM
regions = [t for t in atlas.tiles() if t.item_id == 'mug_pair']
assert regions
pixels = atlas.atlas_pixels()
for cube in model.cubes:
    for face in cube['uv'].values():
        u0, v0, u1, v1 = validate.face_rect(face)
        assert u0 < u1 and v0 < v1
        assert any(t.x <= u0 < u1 <= t.x+t.width and t.y <= v0 < v1 <= t.y+t.height for t in regions)
assert validate.sampled_alphas(model.cubes, pixels, atlas.ATLAS_SIZE) == {255}
assert all(set(t.pixels[3::4]) == {255} for t in regions)
assert all(len(set(tuple(t.pixels[i:i+3]) for i in range(0, len(t.pixels), 4))) > 1 for t in regions)
assert not validate.uv_errors('mug_pair', model.cubes, atlas.GEAR_TILES)
assert not validate.rotation_errors('mug_pair', model.cubes)
members = dict(model.assemblies)
assert {name: len(cubes) for name, cubes in members.items()} == {'mug_pair_shells': 128, 'mug_pair_handles': 16}
tilt.assert_axes(model.cubes, members, generator.ITEM_ASSEMBLIES['mug_pair'])
try:
    tilt.assert_axes(model.cubes, {})
except ValueError:
    pass
else:
    raise AssertionError('Expected registered compound panels')
lo, hi = tilt.bounds(model.cubes)
assert abs(lo[0]+2) < .001 and abs(hi[0]-2) < .001
assert (lo[1], hi[1]) == (0, 1.635)
assert abs(lo[2]+hi[2]) < .001
rows = json.loads(generator.SPEC.read_text())
generator.validate(rows)
root = Path('packs/yasu_ride_rp/models/blocks/yasu_ride')
written = json.loads((root/'mug_pair.geo.json').read_text())['minecraft:geometry'][0]['bones'][0]['cubes']
assert written == generator.rounded(list(model.cubes))
for kind, pair in generator.PAIRS.items():
    geometry = generator.pair_geometry(kind, rows)
    saved = json.loads((root/(kind+'_decor_pair.geo.json')).read_text())
    assert saved == geometry
    for end, (left, ahead) in enumerate(pair['ends']):
        bone = next(b for b in geometry['minecraft:geometry'][0]['bones'] if b['name'] == f'end{end}_mug_pair')
        translated = {name: generator.rounded([generator.moved(c, left, ahead) for c in part]) for name, part in members.items()}
        tilt.assert_axes(bone['cubes'], translated, generator.ITEM_ASSEMBLIES['mug_pair'])
        assert validate.sampled_alphas(bone['cubes'], pixels, atlas.ATLAS_SIZE) == {255}
print('ok')
`),
  ).toBe("ok\n");
});
