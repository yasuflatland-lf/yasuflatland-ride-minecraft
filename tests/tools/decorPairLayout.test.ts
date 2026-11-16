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

// Orphan cleanup took up to 22.1 s in CI (PR #1738, four runs); 4x rounded up to 30 s.
it("reports orphan pair geometries without rewriting in check mode and removes them on regeneration", {
  timeout: 90_000,
}, async () => {
  expect(
    await python.run(`
import json, subprocess, sys, tempfile
from pathlib import Path
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    rp, bp = root / 'rp', root / 'bp'
    atlas = rp / 'textures/item_texture.json'
    atlas.parent.mkdir(parents=True)
    atlas.write_text(json.dumps({'resource_pack_name': 'yasu_ride', 'texture_name': 'atlas.items', 'texture_data': {}}))
    command = [sys.executable, '-I', 'tools/gen_camping_gear.py', str(rp), str(bp)]
    subprocess.run(command, check=True, capture_output=True)
    subprocess.run(command + ['--check'], check=True, capture_output=True)
    models = rp / 'models/blocks/yasu_ride'
    orphans = [models / (name + '_decor_pair.geo.json') for name in ('shelf', 'cabinet', 'fridge', 'retired_layout')]
    for path in orphans:
        path.write_text('{}')
    before = {path: path.read_bytes() for path in root.rglob('*') if path.is_file()}
    result = subprocess.run(command + ['--check'], capture_output=True, text=True)
    assert result.returncode == 1
    for path in orphans:
        assert f'{path} (orphan decor pair geometry)' in result.stderr
    assert before == {path: path.read_bytes() for path in root.rglob('*') if path.is_file()}
    subprocess.run(command, check=True, capture_output=True)
    assert not any(path.exists() for path in orphans)
    assert (models / 'drawers_decor_pair.geo.json').exists()
    subprocess.run(command + ['--check'], check=True, capture_output=True)
print('ok')
`),
  ).toBe("ok\n");
});
