import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `
import copy, json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool, load_tool_in
registry = load_tool('gear_registry')
atlas = load_tool('gear_atlas')
validate = load_tool('gear_validate')
tilt = load_tool('cube_tilt')
generator = load_tool('gen_camping_gear')
item = load_tool_in('gear_items', 'enamel_kettle')
model = registry.build('enamel_kettle')
`;

it("keeps the opaque kettle inside its tile, bounds and cube budgets", async () => {
  expect(
    await python.run(`${setup}
assert len(model.cubes) <= validate.MAX_CUBES_PER_ITEM
assert 2*len(model.cubes) <= validate.MAX_CUBES_PER_PAIR_BLOCK
assert model.texture_request == ('enamel_kettle',)
assert atlas.GEAR_TILES['enamel_kettle'] == 3
regions = [t for t in atlas.tiles() if t.item_id == 'enamel_kettle']
assert regions
for cube in model.cubes:
    for face in cube['uv'].values():
        x0, y0, x1, y1 = validate.face_rect(face)
        assert 388 <= x0 <= x1 <= 508 and 4 <= y0 <= y1 <= 124
        assert any(t.x <= x0 <= x1 <= t.x+t.width and t.y <= y0 <= y1 <= t.y+t.height for t in regions)
assert validate.sampled_alphas(model.cubes, atlas.atlas_pixels(), atlas.ATLAS_SIZE) == {255}
lo, hi = tilt.bounds(model.cubes)
assert abs(lo[0]+2.5) < .001 and abs(hi[0]-2.5) < .001
assert lo[1] == 0 and hi[1] == 5
assert all(c.get('rotation', [0,0,0])[2] == 0 and tilt.axis_count(c) <= 2 for c in model.cubes)
tilt.assert_axes(model.cubes, model.assemblies, item.ASSEMBLIES)
for name, members in model.assemblies.items():
    assert name.startswith('enamel_kettle_')
    assert item.ASSEMBLIES[name]['owner'] == 'camping_gear'
    assert item.ASSEMBLIES[name]['cubes'] == len(members)
    assert all(c in model.cubes for c in members)
bar = model.assemblies['enamel_kettle_handle'][5]
assert tilt.axis_count(bar) == 0
assert round(bar['origin'][1]+bar['size'][1], 6) == 5
handle_z = bar['origin'][2]+bar['size'][2]/2
for cube in model.assemblies['enamel_kettle_spout']:
    assert abs(cube['pivot'][2]-handle_z) < .0001
for pair in generator.PAIRS.values():
    for left, ahead in pair['ends']:
        cubes = [generator.moved(c, left, ahead) for c in model.cubes]
        members = {name: [generator.moved(c, left, ahead) for c in part] for name, part in model.assemblies.items()}
        tilt.assert_axes(cubes, members, item.ASSEMBLIES)
        lo, hi = tilt.bounds(cubes)
        assert -8 <= lo[0] <= hi[0] <= 8 and -8 <= lo[2] <= hi[2] <= 8
generator.validate(json.loads(generator.SPEC.read_text()))
print('ok')
`),
  ).toBe("ok\n");
});

it("rejects unregistered compound cubes and invalid assembly ownership names", async () => {
  expect(
    await python.run(`${setup}
def rejects(call):
    try:
        call()
    except ValueError:
        return
    raise AssertionError('Expected assembly validation to reject the fixture')
cube = model.assemblies['enamel_kettle_spout'][0]
assert tilt.axis_count(cube) == 2
rejects(lambda: tilt.assert_axes([cube], {}, {}))
rejects(lambda: tilt.assert_axes([cube], {'enamel_kettle_spout': [cube]}, item.ASSEMBLIES))
rejects(lambda: generator.collect_assemblies({'enamel_kettle': {'other_body': {'owner': 'camping_gear', 'cubes': 1}}}))
# Prefixes can overlap, so duplicate names need their own rejection.
rejects(lambda: generator.collect_assemblies({'enamel': {'enamel_kettle_body': {}}, 'enamel_kettle': {'enamel_kettle_body': {}}}))
original = generator.MODELS_BY_ID['enamel_kettle']
try:
    generator.MODELS_BY_ID['enamel_kettle'] = generator.gear_model.GearModel(original.cubes, original.texture_request)
    try:
        generator.validate(json.loads(generator.SPEC.read_text()))
    except SystemExit as error:
        assert 'registered but missing' in str(error)
    else:
        raise AssertionError('Generator accepted missing assembly members')
finally:
    generator.MODELS_BY_ID['enamel_kettle'] = original
print('ok')
`),
  ).toBe("ok\n");
});
