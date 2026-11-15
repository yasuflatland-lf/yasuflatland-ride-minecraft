import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

const python = (script: string) =>
  execFileSync("python3", ["-I", "-c", script], {
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 8 * 1024 * 1024,
  });

it("ignores exactly the manifest's untracked outputs and lets Biome use Git ignores", () => {
  python(`
import json, subprocess, sys
from pathlib import Path
patterns = subprocess.check_output(
    [sys.executable, '-I', 'tools/run_generators.py', '--list-outputs', '--untracked'], text=True).splitlines()
section = Path('.gitignore').read_text().split('# Generated outputs (tools/generators.json)\\n')[1]
assert section.splitlines() == patterns
assert json.loads(Path('biome.json').read_text())['files']['includes'] == ['**', '!spike']
`);
});

it("runs afterGenerators entries last without a formatter in write and check modes", () => {
  python(`
import json, sys
from unittest.mock import patch
sys.path.insert(0, 'tools')
import run_generators as runner
plan = json.loads(runner.PLAN.read_text())
assert 'format' not in plan
assert all('afterFormat' not in entry for entry in plan['generators'])
assert [entry['script'] for entry in plan['generators'] if entry.get('afterGenerators')] == ['render_preview.py']
entries = [
    {'script': 'render_preview.py', 'args': [], 'afterGenerators': True},
    {'script': 'first.py', 'args': ['pack']},
    {'script': 'second.py', 'args': []},
]
for entry in entries:
    entry.update(outputs=[], reads=[])
for check in (False, True):
    with patch.object(sys, 'argv', ['run_generators.py'] + (['--check'] if check else [])), \
         patch.object(runner.Path, 'read_text', return_value=json.dumps({'generators': entries})), \
         patch.object(runner, 'generation_status', return_value={'missing_build': []}), \
         patch.object(runner, 'STAMP'), \
         patch.object(runner, 'run_parallel') as run:
        runner.main()
    assert [call.args[:2] for call in run.call_args_list] == [
        ([entries[1], entries[2]], check), ([entries[0]], check)
    ]
`);
});

it("uses manifest lists in CI and ignores Python cache paths", () => {
  python(`
import os, subprocess, tempfile, textwrap
from pathlib import Path
from unittest.mock import patch
workflow = Path('.github/workflows/unit-test.yml').read_text()
start = workflow.index('          import fnmatch')
end = workflow.index('          PYTHON', start)
script = textwrap.dedent(workflow[start:end])
original = subprocess.check_output
with tempfile.TemporaryDirectory() as directory:
    output = Path(directory) / 'output'
    for path, expected in [
        ('tools/gear_items/new_item.py', True),
        ('tools/gear_items/__pycache__/new_item.pyc', False),
        ('packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json', True),
        ('packs/yasu_ride_rp/textures/item_texture.json', False),
        ('packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json', False),
        ('packs/yasu_ride_rp/models/entity/yasu_ride/stand_in.geo.json', False),
        ('docs/images/wicker-tiles-preview.png', False),
        ('docs/README.md', False),
        ('package.json', True),
    ]:
        output.write_text('')
        def check_output(command, **kwargs):
            return path + '\\0' if command[0] == 'git' else original(command, **kwargs)
        with patch.dict(os.environ, {'GITHUB_OUTPUT': str(output)}), patch('subprocess.check_output', check_output):
            exec(script, {})
        assert output.read_text() == f'changed={str(expected).lower()}\\n', path
`);
});

it("matches manifest globs and exposes declared inputs and tracking", () => {
  python(`
import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest

class ManifestTests(unittest.TestCase):
    def test_patterns(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = Path(directory) / 'plan.json'
            plan.write_text(json.dumps({'generators': [
                {'script': 'model.py', 'outputs': ['packs/model.json', 'packs/car*.png'],
                 'reads': ['packs/source.json']},
                {'script': 'preview.py', 'outputs': ['docs/images/**'],
                 'reads': ['packs/source.json'], 'tracked': True}
            ]}))
            manifest = OutputManifest.load(plan)
            for path, generator in [('packs/model.json', 'model.py'),
                                    ('packs/car_blue.png', 'model.py'),
                                    ('packs/car/trailer.png', 'model.py'),
                                    ('docs/images/items/chair.png', 'preview.py')]:
                with self.subTest(path=path):
                    self.assertEqual(manifest.matches(path).generator, generator)
            self.assertIsNone(manifest.matches('packs/handwritten.json'))
            self.assertEqual(manifest.untracked_patterns(), ('packs/model.json', 'packs/car*.png'))
            self.assertEqual(set(manifest.inputs()), {'tools/**', 'packs/source.json'})
            self.assertTrue(manifest.matches('docs/images/items/chair.png').tracked)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(ManifestTests)
result = unittest.TextTestRunner().run(suite)
assert result.wasSuccessful()
`);
});

it("declares every checked output exactly once and marks only generated assets", () => {
  expect(
    python(`
import fnmatch, json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest
manifest = OutputManifest.load()
handwritten = [
    'packs/yasu_ride_rp/models/blocks/yasu_ride/deck_floor.geo.json',
    'packs/yasu_ride_rp/models/entity/yasu_ride/deck_seat.geo.json',
    'packs/yasu_ride_rp/models/entity/yasu_ride/stand_in.geo.json',
    'packs/yasu_ride_test_rp/models/entity/yasu_ride_test/cutout_probe.geo.json',
    'packs/yasu_ride_test_rp/textures/entity/yasu_ride_test/cutout_probe.png',
]
for path in handwritten:
    assert Path(path).is_file(), path
    assert manifest.matches(path) is None, path
with tempfile.TemporaryDirectory() as directory:
    report = Path(directory) / 'touched.jsonl'
    subprocess.run([sys.executable, '-I', 'tools/run_generators.py', '--check',
                    '--report-touched', str(report)], check=True, stdout=subprocess.DEVNULL)
    touched = [json.loads(line) for line in report.read_text().splitlines()]
assert touched
assert {entry['generator'] for entry in touched} == {
    entry['script'] for entry in json.loads(Path('tools/generators.json').read_text())['generators']
}
for entry in touched:
    matches = [output for output in manifest.outputs()
               if fnmatch.fnmatchcase(entry['path'], output.pattern)]
    assert len(matches) == 1, (entry, matches)
    assert matches[0].generator == entry['generator'], (entry, matches)
tracked = subprocess.check_output(['git', 'ls-files', '-z'], text=True).split('\\0')
pack_art = {path for path in tracked if path.startswith('packs/')
            and ('/models/' in path or '/textures/' in path)}
assert pack_art == set(handwritten) | {entry['path'] for entry in touched
                                     if entry['path'] in pack_art}
for output in manifest.outputs():
    matches = [path for path in tracked if fnmatch.fnmatchcase(path, output.pattern)]
    assert bool(matches) == output.tracked, (output, matches)

for flag, expected in [('--list-outputs', [o.pattern for o in manifest.outputs()]),
                       ('--list-inputs', list(manifest.inputs()))]:
    actual = subprocess.check_output([sys.executable, '-I', 'tools/run_generators.py', flag], text=True)
    assert actual.splitlines() == expected
actual = subprocess.check_output([sys.executable, '-I', 'tools/run_generators.py',
                                  '--list-outputs', '--untracked'], text=True)
assert actual.splitlines() == list(manifest.untracked_patterns())
print('manifest covers every generator output')
`),
  ).toContain("manifest covers every generator output");
}, 600_000);

it("lists CI cache paths without creating bytecode inside the cache key inputs", () => {
  python(`
import shlex, shutil, subprocess, tempfile
from pathlib import Path
workflow = Path('.github/workflows/unit-test.yml').read_text()
commands = [line.strip().split(' >> ')[0] for line in workflow.splitlines()
            if '--list-outputs --untracked >>' in line]
assert len(commands) == 4
for command in commands:
    with tempfile.TemporaryDirectory() as directory:
        shutil.copytree('tools', Path(directory) / 'tools', ignore=shutil.ignore_patterns('__pycache__'))
        subprocess.check_output(shlex.split(command), cwd=directory, text=True)
        assert not list(Path(directory).rglob('__pycache__')), command
`);
});
