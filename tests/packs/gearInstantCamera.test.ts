import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

// Full-catalog validation and pair generation need headroom under CI coverage.
it("keeps the painted twin-lens camera within budget and validates its registered barrels at both pair ends", {
  timeout: 30_000,
}, async () => {
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
generator = load_tool('gen_camping_gear')
model = registry.build('instant_camera')
assert len(model.cubes) == 249
assert len(model.cubes) <= validation.MAX_CUBES_PER_ITEM
assert 2 * len(model.cubes) <= validation.MAX_CUBES_PER_PAIR_BLOCK
assert all(all(s > 0 for s in cube['size']) for cube in model.cubes)
members = dict(model.assemblies)
table = generator.ITEM_ASSEMBLIES['instant_camera']
assert table == {'instant_camera_barrels': {'owner': 'camping_gear', 'cubes': 80}}
tilt.assert_axes(model.cubes, members, table)
assert tilt.compound_cubes(model.cubes)
assert not validation.rotation_errors('instant_camera', model.cubes)
lo, hi = tilt.bounds(model.cubes)
assert abs(lo[0]+2.5) < .001 and abs(hi[0]-2.5) < .001
assert (lo[1], hi[1]) == (0, 7)
assert lo[2] >= -2.23 and hi[2] <= 2.23
assert abs(lo[2]+hi[2]) < .001
assert atlas.GEAR_TILES['instant_camera'] == 12
regions = [t for t in atlas.tiles() if t.item_id == 'instant_camera']
assert regions
faces = [validation.face_rect(f) for cube in model.cubes for f in cube['uv'].values()]
for tile in regions:
    assert set(tile.pixels[3::4]) <= {0, 255}
    # Every reserved texel is sampled; a forgotten painted region wastes the fixed cell.
    for y in range(tile.y, tile.y+tile.height):
        for x in range(tile.x, tile.x+tile.width):
            assert any(u0 <= x < u1 and v0 <= y < v1 for u0, v0, u1, v1 in faces)
    padded = atlas.pad_cutouts(tile)
    opaque_rgb = {tuple(tile.pixels[i:i+3]) for i in range(0, len(tile.pixels), 4) if tile.pixels[i+3] == 255}
    if opaque_rgb:
        assert all(tuple(padded[i:i+3]) in opaque_rgb for i in range(0, len(padded), 4) if padded[i+3] == 0)
assert not atlas.check_alpha('instant_camera', False)
assert not validation.uv_errors('instant_camera', model.cubes, atlas.GEAR_TILES)
pixels = atlas.atlas_pixels()
assert validation.sampled_alphas(model.cubes, pixels, atlas.ATLAS_SIZE) == {0, 255}
# The glass coatings occupy the centers of the two largest front discs and stay opaque.
for width in (23, 19):
    tile = next(t for t in regions if t.width == width and t.height == width)
    assert tile.get(width//2, width//2)[3] == 255
rows = json.loads(generator.SPEC.read_text())
generator.validate(rows)
root = Path('packs/yasu_ride_rp/models/blocks/yasu_ride')
saved = json.loads((root/'instant_camera.geo.json').read_text())['minecraft:geometry'][0]
shipped = [c for b in saved['bones'] for c in b.get('cubes', [])]
assert len(shipped) == len(model.cubes)
assert shipped == generator.rounded(list(model.cubes))
for kind, pair in generator.PAIRS.items():
    geometry = generator.pair_geometry(kind, rows)
    assert json.loads((root/(kind+'_decor_pair.geo.json')).read_text()) == geometry
    for end, (left, ahead) in enumerate(pair['ends']):
        bone = next(b for b in geometry['minecraft:geometry'][0]['bones'] if b['name'] == f"end{end}_instant_camera")
        translated = {name: generator.rounded([generator.moved(c, left, ahead) for c in part]) for name, part in members.items()}
        tilt.assert_axes(bone['cubes'], translated, table)
        low, high = tilt.bounds(bone['cubes'])
        assert -8 <= low[0] < high[0] <= 8
        assert -8 <= low[2] < high[2] <= 8
        assert 0 <= low[1] < high[1] <= pair.get('inside_px', 16)
        assert validation.sampled_alphas(bone['cubes'], pixels, atlas.ATLAS_SIZE) == {0, 255}
print('ok')
`),
  ).toBe("ok\n");
});
