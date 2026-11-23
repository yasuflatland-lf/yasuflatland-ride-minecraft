import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("shares exactly the declared layouts and resolves every decor pair block geometry", async () => {
  expect(
    await python.run(`
import json, sys
from dataclasses import FrozenInstanceError
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
g = load_tool('gen_camping_gear')
assert {name: layout.ends for name, layout in g.PAIR_LAYOUTS.items()} == {
    'board': ((0, -3.5), (0, 3.5)), 'table': ((3.3, 0), (-3.7, 0))}
assert {kind: pair['layout'] for kind, pair in g.PAIRS.items()} == {
    'shelf': 'board', 'cabinet': 'board', 'fridge': 'board', 'table': 'table'}
for name, layout in g.PAIR_LAYOUTS.items():
    assert layout.name == name
    try:
        layout.name = 'changed'
        raise AssertionError('layout is mutable')
    except FrozenInstanceError:
        pass
models = Path('packs/yasu_ride_rp') / g.MODELS
files = {path.name for path in models.glob('*_decor_pair.geo.json')}
# Drawers retain their independent geometry outside PAIR_LAYOUTS.
assert files - {'drawers_decor_pair.geo.json'} == {
    f'{layout.name}_decor_pair.geo.json' for layout in g.PAIR_LAYOUTS.values()}
referenced = set()
for path in (Path('packs/yasu_ride_bp') / g.BLOCKS).glob('*_decor_pair.block.json'):
    block = json.loads(path.read_text())['minecraft:block']
    assert block['description']['identifier'] == 'yasu_ride:' + path.name.removesuffix('.block.json')
    component = block['components']['minecraft:geometry']
    identifier = component['identifier']
    filename = identifier.removeprefix('geometry.yasu_ride.') + '.geo.json'
    referenced.add(filename)
    geometry = json.loads((models / filename).read_text())['minecraft:geometry'][0]
    assert geometry['description']['identifier'] == identifier
    assert set(component['bone_visibility']) == {bone['name'] for bone in geometry['bones']}
assert referenced == files
print('ok')
`),
  ).toBe("ok\n");
});

it("reports retired pair geometries in check mode and removes only those files on regeneration", async () => {
  await python.run(`
import json, sys, tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'tools')
from tool_loader import load_tool
g = load_tool('gen_camping_gear')
with tempfile.TemporaryDirectory() as temporary:
    rp = Path(temporary) / 'rp'
    models = rp / g.MODELS
    models.mkdir(parents=True)
    retired = [models / f'{name}_decor_pair.geo.json' for name in ('retired', 'shelf')]
    retained = [models / name for name in (
        'board_decor_pair.geo.json', 'table_decor_pair.geo.json', 'drawers_decor_pair.geo.json', 'other.geo.json')]
    for path in retired + retained:
        path.write_bytes(b'fixture')
    args = ['gen_camping_gear', str(rp), str(Path(temporary) / 'bp')]
    item = next(item for item in json.loads(g.SPEC.read_text()) if not item['hanging'])
    spec = Path(temporary) / 'spec.json'
    spec.write_text(json.dumps([item]))
    with (patch.object(g, 'SPEC', spec), patch.object(g, 'SHAPES', {item['id']: g.SHAPES[item['id']]}),
          patch.object(g, 'validate'), patch.object(g, 'write_geometries'), patch.object(g.texture_io.Outputs, 'json'),
          patch.object(g.texture_io.Outputs, 'png')):
        with patch.object(sys, 'argv', args + ['--check']):
            try:
                g.main()
            except SystemExit as error:
                assert set(str(error).splitlines()[1:]) == {f'{path} (orphan decor pair geometry)' for path in retired}
            else:
                raise AssertionError('orphan was not reported')
        assert all(path.read_bytes() == b'fixture' for path in retired + retained)
        with patch.object(sys, 'argv', args):
            g.main()
    assert not any(path.exists() for path in retired)
    assert all(path.read_bytes() == b'fixture' for path in retained)
`);
});
