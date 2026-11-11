import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("keeps the hanging planter within its budget, bounds, and registered assembly", async () => {
  const output = await python.run(`
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool, load_tool_in
registry = load_tool('gear_registry')
atlas = load_tool('gear_atlas')
validation = load_tool('gear_validate')
tilt = load_tool('cube_tilt')
item = load_tool_in('gear_items', 'macrame_planter')
model = registry.build('macrame_planter')
assert len(model.cubes) <= validation.MAX_CUBES_PER_ITEM
assert tilt.bounds(model.cubes)[0][:2] == [-2.5, 0]
assert tilt.bounds(model.cubes)[1][:2] == [2.5, 10]
assert all(c.get('rotation', [0, 0, 0])[2] == 0 for c in model.cubes)
compound = tilt.compound_cubes(model.cubes)
assert len(compound) == item.ASSEMBLIES['macrame_planter_net']['cubes']
tilt.assert_axes(model.cubes, {'macrame_planter_net': compound}, registry.assemblies('macrame_planter'))
assert atlas.GEAR_TILES['macrame_planter'] == 10
assert any(t.item_id == 'macrame_planter' for t in atlas.tiles())
print('ok')
`);
  expect(output.trim()).toBe("ok");
});

it("samples painted opaque materials and binary cutouts only on the intended plates", async () => {
  const output = await python.run(`
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool, load_tool_in
registry = load_tool('gear_registry')
atlas = load_tool('gear_atlas')
validation = load_tool('gear_validate')
item = load_tool_in('gear_items', 'macrame_planter')
model = registry.build('macrame_planter')
regions = [t for t in atlas.tiles() if t.item_id == 'macrame_planter']
pixels = atlas.atlas_pixels()
cutouts = set()
for cube, (raw, material) in zip(model.cubes, item._geometry(), strict=True):
    for side, face in cube['uv'].items():
        u0, v0, u1, v1 = validation.face_rect(face)
        assert any(t.x <= u0 < u1 <= t.x+t.width and t.y <= v0 < v1 <= t.y+t.height for t in regions)
        sampled = [tuple(pixels[4*(y*atlas.ATLAS_SIZE+x):4*(y*atlas.ATLAS_SIZE+x)+4]) for y in range(int(v0), int(v1)) for x in range(int(u0), int(u1))]
        alphas = {p[3] for p in sampled}
        if side not in raw['uv']:
            assert alphas == {0}
        elif material in item.CUTOUTS:
            assert alphas == {0, 255}, material
            cutouts.add(material)
        else:
            assert alphas == {255}, material
    colors = {tuple(pixels[4*(y*atlas.ATLAS_SIZE+x):4*(y*atlas.ATLAS_SIZE+x)+3]) for face in cube['uv'].values() for u0, v0, u1, v1 in [validation.face_rect(face)] for y in range(int(v0), int(v1)) for x in range(int(u0), int(u1))}
    if min(cube['size']) > 0.06:
        assert len(colors) > 1, material
assert cutouts == set(item.CUTOUTS)
print('ok')
`);
  expect(output.trim()).toBe("ok");
});
