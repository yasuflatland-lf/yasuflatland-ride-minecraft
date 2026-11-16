import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds an opaque painted toaster within the item and pair budgets", async () => {
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
model = registry.build('toaster')
assert 5 < len(model.cubes) <= validation.MAX_CUBES_PER_ITEM
assert 2 * len(model.cubes) <= validation.MAX_CUBES_PER_PAIR_BLOCK
tilt.assert_axes(model.cubes, {})
lo, hi = tilt.bounds(model.cubes)
assert lo[0] == -3 and hi[0] == 3
assert lo[1] == 0 and hi[1] == 5
assert lo[2] >= -3.5 and hi[2] <= 3.5
assert all(all(s > 0 for s in c['size']) for c in model.cubes)
assert atlas.GEAR_TILES['toaster'] == 2
regions = [t for t in atlas.tiles() if t.item_id == 'toaster']
assert [(t.width, t.height) for t in regions] == [(88, 16), (12, 12), (8, 8), (60, 33), (48, 25), (48, 59), (48, 59)]
assert all(t.get(x, y)[3] == 255 for t in regions for y in range(t.height) for x in range(t.width))
assert not validation.uv_errors('toaster', model.cubes, atlas.GEAR_TILES)
assert any(validation.face_rect(f)[0] >= 260 for c in model.cubes for f in c['uv'].values())
assert validation.sampled_alphas(model.cubes, atlas.atlas_pixels(), atlas.ATLAS_SIZE) == {255}
geometry = json.loads(Path('packs/yasu_ride_rp/models/blocks/yasu_ride/toaster.geo.json').read_text())['minecraft:geometry'][0]
shipped = [c for b in geometry['bones'] for c in b.get('cubes', [])]
assert len(shipped) == len(model.cubes)
png = load_tool('render_preview').read_png(Path('packs/yasu_ride_rp/textures/blocks/yasu_ride/camping_gear.png'))
pixels = bytes(v for row in png for pixel in row for v in pixel)
assert validation.sampled_alphas(shipped, pixels, atlas.ATLAS_SIZE) == {255}
print('ok')
`),
  ).toBe("ok\n");
});
