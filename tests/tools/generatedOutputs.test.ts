import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = (script: string) =>
  execFileSync("python3", ["-I", "-c", script], {
    encoding: "utf8",
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
import json, sys, tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'tools')
import run_generators as runner
from generated_outputs import OutputManifest
plan = json.loads(runner.PLAN.read_text())
assert 'format' not in plan
assert all('afterFormat' not in entry for entry in plan['generators'])
assert [entry['script'] for entry in plan['generators'] if entry.get('afterGenerators')] == ['render_preview.py']
entries = [
    {'script': 'render_preview.py', 'args': [], 'afterGenerators': True,
     'after': ['first.py', 'second.py'], 'reads': [], 'outputs': []},
    {'script': 'first.py', 'args': ['pack'], 'reads': [], 'outputs': []},
    {'script': 'second.py', 'args': [], 'reads': [], 'outputs': []},
]
for check in (False, True):
    with tempfile.TemporaryDirectory() as directory, \\
         patch.object(sys, 'argv', ['run_generators.py'] + (['--check'] if check else [])), \\
         patch.object(runner.Path, 'read_text', return_value=json.dumps({'generators': entries})), \\
         patch.object(runner.OutputManifest, 'load', return_value=OutputManifest(entries)), \\
         patch.object(runner, 'read_touched_report', return_value=()), \\
         patch.object(runner.OutputManifest, 'ownership_errors', return_value=[]), \\
         patch.object(runner, 'STAMP', Path(directory) / 'stamp.json'), \\
         patch.object(runner, 'run_parallel') as run_parallel, \\
         patch.object(runner.subprocess, 'run', side_effect=AssertionError('unexpected subprocess')):
        runner.main()
    assert [call.args[:2] for call in run_parallel.call_args_list] == [
        ([entries[1], entries[2]], check), ([entries[0]], check)
    ]
    assert run_parallel.call_args_list[1].kwargs == {'completed': ['first.py', 'second.py']}
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
        ('tools/item_texture_base.json', True),
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

it("allows only hand-written or tracked generated art in Git and matches the tracked flags", () => {
  python(`
import fnmatch, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest
manifest = OutputManifest.load()
plan = json.loads(Path('tools/generators.json').read_text())
gear = next(entry for entry in plan['generators'] if entry['script'] == 'gen_camping_gear.py')
assert gear['reads'] == []
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
tracked = subprocess.check_output(['git', 'ls-files', '-z'], text=True).split('\\0')
pack_art = {path for path in tracked if path.startswith('packs/')
            and ('/models/' in path or '/textures/' in path)}
for path in pack_art:
    if path not in handwritten:
        output = manifest.matches(path)
        assert output is not None and output.tracked, path
assert set(handwritten) <= pack_art
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
`);
});

it("lists CI cache paths without creating bytecode inside the cache key inputs", () => {
  python(`
import shlex, shutil, subprocess, tempfile
from pathlib import Path
workflow = Path('.github/actions/generated-files/action.yml').read_text()
commands = [line.strip().split(' >> ')[0] for line in workflow.splitlines()
            if '--list-outputs --untracked >>' in line]
assert len(commands) == 1
for command in commands:
    with tempfile.TemporaryDirectory() as directory:
        shutil.copytree('tools', Path(directory) / 'tools', ignore=shutil.ignore_patterns('__pycache__'))
        subprocess.check_output(shlex.split(command), cwd=directory, text=True)
        assert not list(Path(directory).rglob('__pycache__')), command
`);
});

it("reports ownership errors with exact, sorted, deduplicated messages", () => {
  python(`
import sys, unittest
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest, TouchedOutput

def manifest(*patterns):
    return OutputManifest([{'script': name, 'outputs': outputs, 'reads': []}
                           for name, outputs in patterns])

class OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.manifest = manifest(('z.py', ['packs/z.json', 'packs/z.png']),
                                 ('a.py', ['packs/a*']))
        self.clean = [TouchedOutput('z.py', 'packs/z.json'),
                      TouchedOutput('z.py', 'packs/z.png'),
                      TouchedOutput('a.py', 'packs/a/nested.png')]

    def test_clean_and_plan_order(self):
        self.assertEqual(self.manifest.generators(), ('z.py', 'a.py'))
        self.assertEqual(self.manifest.ownership_errors(iter(self.clean)), [])

    def test_undeclared(self):
        self.assertEqual(self.manifest.ownership_errors(self.clean + [
            TouchedOutput('a.py', 'packs/A.png')]), [
            'packs/A.png: touched by a.py but declared by no output pattern'])

    def test_multiple_patterns(self):
        overlapping = manifest(('a.py', ['packs/*', 'packs/a*']))
        self.assertEqual(overlapping.ownership_errors([TouchedOutput('a.py', 'packs/a.png')]), [
            'packs/a.png: matched by more than one output pattern: a.py:packs/*, a.py:packs/a*'])

    def test_wrong_owner(self):
        self.assertEqual(self.manifest.ownership_errors([
            TouchedOutput('a.py', 'packs/z.json'), *self.clean[1:]]), [
            'packs/z.json: touched by a.py but declared by z.py'])

    def test_no_outputs(self):
        self.assertEqual(self.manifest.ownership_errors([]), [
            'a.py: reported no outputs', 'z.py: reported no outputs'])

    def test_did_not_run(self):
        self.assertEqual(self.manifest.ownership_errors(self.clean, ['z.py']), [
            'a.py: reported outputs but did not run'])

    def test_duplicate(self):
        unknown = TouchedOutput('a.py', 'unknown')
        self.assertEqual(self.manifest.ownership_errors(self.clean + [unknown, unknown]), [
            'unknown: touched by a.py but declared by no output pattern'])

    def test_subset(self):
        self.assertEqual(self.manifest.ownership_errors(self.clean[:2], iter(['z.py'])), [])
        self.assertEqual(self.manifest.ownership_errors([], []), [])

suite = unittest.defaultTestLoader.loadTestsFromTestCase(OwnershipTests)
assert unittest.TextTestRunner().run(suite).wasSuccessful()
`);
});

it("reads touched reports written by Outputs and rejects malformed lines with their number", () => {
  python(`
import json, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'tools')
from generated_outputs import TouchedOutput, read_touched_report
from texture_io import Outputs

class ReportTests(unittest.TestCase):
    def test_writer_format(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'touched.jsonl'
            report.write_text('\\n  \\n')
            with patch.dict(os.environ, {'GENERATED_OUTPUTS_REPORT': str(report)}), \\
                 patch.object(sys, 'argv', ['tools/model.py']):
                Outputs(check=True)._touch(Path('packs/model.json'))
            self.assertEqual(read_touched_report(report), (
                TouchedOutput('model.py', 'packs/model.json'),))

    def test_malformed_line(self):
        malformed = ['{', 'null', '[]', '"text"', '{}',
                     '{"generator":"a.py"}', '{"generator":1,"path":"a"}',
                     '{"generator":"a.py","path":null}',
                     '{"generator":"a.py","path":"a","extra":true}']
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'touched.jsonl'
            for line in malformed:
                with self.subTest(line=line):
                    report.write_text(json.dumps({'generator': 'a.py', 'path': 'a'}) + '\\n\\n' + line)
                    with self.assertRaisesRegex(ValueError, 'line 3'):
                        read_touched_report(report)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(ReportTests)
assert unittest.TextTestRunner().run(suite).wasSuccessful()
`);
});

it("accepts generated literal plans and identifies a reassigned path", async () => {
  const worker = startPythonWorker();
  try {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.nat({ max: 100_000 }), {
          minLength: 2,
          maxLength: 12,
        }),
        fc.nat(),
        async (ids, selection) => {
          await worker.run(
            `import json, sys
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest, TouchedOutput
ids, selection = json.loads(sys.stdin.read())
entries = [{'script': f'gen_{key}.py', 'reads': [],
            'outputs': [f'packs/{key}/first.json', f'packs/{key}/second.json']}
           for key in ids]
manifest = OutputManifest(entries)
touched = [TouchedOutput(entry['script'], path)
           for entry in entries for path in entry['outputs']]
assert manifest.ownership_errors(touched) == []
index = selection % len(entries)
original = touched[index * 2]
other = entries[(index + 1) % len(entries)]['script']
touched[index * 2] = TouchedOutput(other, original.path)
assert manifest.ownership_errors(touched) == [
    f'{original.path}: touched by {other} but declared by {original.generator}']
`,
            JSON.stringify([ids, selection]),
          );
        },
      ),
    );
  } finally {
    await worker.close();
  }
});

it("uses the shared generated-files action in every generation job", () => {
  python(`
import re
from pathlib import Path
for name, jobs in [
    ('unit-test', ['quick', 'test', 'tools', 'coverage', 'model']),
    ('integration-test', ['generate', 'in-game']),
    ('release', ['build']),
]:
    workflow = Path(f'.github/workflows/{name}.yml').read_text()
    assert 'hashFiles' not in workflow
    assert 'run: pnpm generate' not in workflow
    for job in jobs:
        body = workflow.split(f'  {job}:\\n', 1)[1]
        body = re.split(r'\\n  [a-z][a-z-]*:', body)[0]
        assert body.count('uses: ./.github/actions/generated-files') == 1, job
        assert body.index('actions/checkout@') < body.index('jdx/mise-action@') < body.index('uses: ./.github/actions/generated-files'), job
        if job in ('model', 'generate', 'in-game'):
            guard = "steps.inputs.outputs.changed == 'true'" if job == 'model' else "steps.runner.outputs.present == 'true'"
            assert f"- if: {guard}\\n        uses: ./.github/actions/generated-files" in body
`);
});

it("makes the in-game matrix wait for the generate job", () => {
  python(`
from pathlib import Path
workflow = Path('.github/workflows/integration-test.yml').read_text()
body = workflow.split('  in-game:\\n', 1)[1]
assert '    needs: generate\\n' in body
assert 'pnpm install' not in workflow.split('  in-game:\\n', 1)[0]
assert 'workflow_run' not in workflow
`);
});

it("makes every integration job that uses the generated-files action depend on generate", () => {
  python(`
import re
from pathlib import Path
workflow = Path('.github/workflows/integration-test.yml').read_text()
jobs = {}
for match in re.finditer(r'^  ([a-z][a-z-]*):\\n(.*?)(?=^  [a-z][a-z-]*:\\n|\\Z)', workflow.split('\\njobs:\\n', 1)[1], re.S | re.M):
    jobs[match.group(1)] = match.group(2)
assert 'generate' in jobs

def dependencies(body):
    match = re.search(r'^    needs:[ \\t]*(\\[[^\\]]*\\]|[^\\n]*)(?:\\n((?:      - [^\\n]+\\n)*))?', body, re.M)
    if not match:
        return []
    return re.findall(r'[a-z][a-z-]*', match.group(1) + ' ' + (match.group(2) or ''))

def reaches_generate(job, seen):
    if job == 'generate':
        return True
    if job in seen or job not in jobs:
        return False
    seen.add(job)
    return any(reaches_generate(need, seen) for need in dependencies(jobs[job]))

for job, body in jobs.items():
    if job != 'generate' and 'uses: ./.github/actions/generated-files' in body:
        assert reaches_generate(job, set()), f'integration-test: {job} must need generate'
`);
});

it("reports cache hits and misses with elapsed generation time", () => {
  python(`
import os, re, subprocess, tempfile, textwrap
from pathlib import Path
action = Path('.github/actions/generated-files/action.yml').read_text()
script = textwrap.dedent(action.rsplit('      run: |\\n', 1)[1])
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / 'pnpm').write_text('#!/bin/bash\\n[ "$1" = generate ] || exit 1\\necho generated >> "$CALLS"\\n')
    (root / 'pnpm').chmod(0o755)
    for cache_hit, expected in [('true', 'hit'), ('false', 'miss'), ('', 'miss')]:
        summary = root / 'summary'
        summary.write_text('')
        calls = root / 'calls'
        calls.write_text('')
        env = dict(os.environ, PATH=f'{root}:' + os.environ['PATH'], CACHE_HIT=cache_hit,
                   GITHUB_STEP_SUMMARY=str(summary), CALLS=str(calls))
        subprocess.run(['bash', '-e', '-c', script], env=env, check=True)
        assert re.fullmatch(f'generated files: cache {expected}, [0-9]+s\\n', summary.read_text())
        assert calls.read_text() == 'generated\\n'
`);
});
