import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = (script: string) =>
  execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" });

const fixture = `
import sys
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest
from select_model_scenes import Selection, select
manifest = OutputManifest([
    {'script': 'gen_model.py', 'id': 'model', 'outputs': ['packs/zeta.geo.json'],
     'reads': ['sources/model.json']},
    {'script': 'gen_model.py', 'id': 'textures', 'outputs': ['packs/zeta_*.png'],
     'reads': []},
    {'script': 'gen_alpha.py', 'outputs': ['packs/alpha.geo.json'], 'reads': []},
    {'script': 'gen_texture.py', 'id': 'texture_metadata',
     'outputs': ['packs/texture.json'], 'reads': []},
    {'script': 'gen_texture.py', 'id': 'texture_pixels',
     'outputs': ['packs/texture_*.png'], 'reads': []},
    {'script': 'gen_unused.py', 'outputs': ['packs/unused.json'], 'reads': []},
    {'script': 'catalog.py', 'outputs': ['catalog/*.json'],
     'reads': ['sources/catalog/**'], 'tracked': True},
    {'script': 'render_preview.py', 'id': 'render_preview.py:zeta',
     'outputs': ['docs/images/zeta*.png'],
     'reads': ['packs/zeta.geo.json', 'packs/zeta_white.png', 'packs/texture_white.png',
               'art/zeta/**'], 'tracked': True},
    {'script': 'render_preview.py', 'id': 'render_preview.py:alpha',
     'outputs': ['docs/images/alpha.png'], 'reads': ['packs/alpha.*', 'art/alpha/**']},
])
`;

it("selects scenes and other generators by their declared inputs and outputs", () => {
  python(`${fixture}
cases = [
    ([], Selection((), False)),
    (['docs/guide.md'], Selection((), False)),
    (['art/zeta/nested/a.png'], Selection(('zeta',), False)),
    (['docs/images/alpha.png'], Selection(('alpha',), False)),
    (['docs/images/zeta-rear.png'], Selection(('zeta',), False)),
    (['packs/zeta.geo.json'], Selection(('zeta',), False)),
    (['packs/alpha.geo.json'], Selection(('alpha',), False)),
    (['sources/model.json'], Selection((), True)),
    (['sources/catalog/nested/a.json'], Selection((), True)),
    (['catalog/a.json'], Selection((), True)),
    (['tools/gen_model.py'], Selection(('zeta',), True)),
    (['tools/gen_alpha.py'], Selection(('alpha',), True)),
    (['tools/gen_texture.py'], Selection(('zeta',), True)),
    (['tools/gen_unknown.py'], Selection(('zeta', 'alpha'), True)),
    (['tools/sub/gen_x.py'], Selection(('zeta', 'alpha'), True)),
    (['tools/sub/gen_model.py'], Selection(('zeta', 'alpha'), True)),
    (['tools/gen_unused.py'], Selection((), True)),
    (['tools/gen_model.py', 'tools/gen_alpha.py'], Selection(('zeta', 'alpha'), True)),
    (['art/ZETA/a.png'], Selection((), False)),
    (['tools/__pycache__/shared.pyc', 'art/zeta/__pycache__/a.png'], Selection((), False)),
    (['art/zeta/__pycache__extra/a.png'], Selection(('zeta',), False)),
]
for paths, expected in cases:
    assert select(iter(paths), manifest) == expected, paths
legacy = OutputManifest([
    {'script': 'render_preview.py', 'outputs': ['docs/legacy.png'],
     'reads': ['packs/legacy.geo.json'], 'tracked': True},
])
assert select(['docs/legacy.png'], legacy) == Selection((), False)
assert select(['tools/shared.py'], legacy) == Selection((), True)
`);
});

const sharedPaths = [
  "tools/shared.py",
  "tools/nested/helper.py",
  "tools/render_preview.py",
  "tools/texture_io.py",
  "tools/generators.json",
  "package.json",
  "mise.toml",
  ".github/workflows/unit-test.yml",
];

it.each(sharedPaths)("selects every scene for %s", (path) => {
  python(`${fixture}
assert select([${JSON.stringify(path)}], manifest) == Selection(('zeta', 'alpha'), True)
`);
});

it("handles docs and scene paths across generated names", async () => {
  const worker = startPythonWorker();
  try {
    await fc.assert(
      fc.asyncProperty(fc.nat(), async (key) => {
        await worker.run(`${fixture}
assert select(['docs/guide-${key}.md'], manifest) == Selection((), False)
assert select(['art/zeta/${key}/input.png'], manifest) == Selection(('zeta',), False)
assert select(['tools/shared_${key}.py'], manifest) == Selection(('zeta', 'alpha'), True)
`);
      }),
    );
  } finally {
    await worker.close();
  }
});

it("is independent of path order and duplicates and monotone when paths are added", async () => {
  const path = fc.constantFrom(
    "docs/guide.md",
    "art/zeta/input.png",
    "art/alpha/input.png",
    "tools/gen_model.py",
    "tools/gen_unknown.py",
    "sources/catalog/a.json",
    "catalog/a.json",
    "tools/__pycache__/a.pyc",
    ...sharedPaths,
  );
  const worker = startPythonWorker();
  try {
    await fc.assert(
      fc.asyncProperty(
        fc.array(path, { maxLength: 20 }),
        fc.array(path, { maxLength: 10 }),
        async (paths, added) => {
          await worker.run(
            `${fixture}
import json
paths, added = json.loads(sys.stdin.read())
before = select(iter(paths), manifest)
assert before == select(reversed(paths + paths), manifest)
after = select(iter(paths + added), manifest)
assert set(before.scenes) <= set(after.scenes)
assert not before.others or after.others
`,
            JSON.stringify([paths, added]),
          );
        },
      ),
    );
  } finally {
    await worker.close();
  }
});

it("reads NUL-separated paths in isolated CLI execution and supports --all", () => {
  python(`${fixture}
import json, shutil, subprocess, tempfile
from pathlib import Path
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    for name in ['select_model_scenes.py', 'generated_outputs.py']:
        shutil.copyfile(Path('tools') / name, root / name)
    (root / 'generators.json').write_text(json.dumps({'generators': [
        {'script': 'render_preview.py', 'id': 'render_preview.py:zeta',
         'outputs': ['docs/zeta.png'], 'reads': ['art/zeta/**']},
        {'script': 'render_preview.py', 'id': 'render_preview.py:alpha',
         'outputs': ['docs/alpha.png'], 'reads': ['art/alpha/**']},
    ]}))
    command = [sys.executable, '-I', str(root / 'select_model_scenes.py')]
    for args, data, expected in [
        ([], b'', {'scenes': [], 'others': False}),
        ([], b'art/zeta/space and\\nnewline.png\\0docs/guide.md\\0',
         {'scenes': ['zeta'], 'others': False}),
        ([], b'art/alpha/a.png', {'scenes': ['alpha'], 'others': False}),
        ([], b'tools/shared.py\\0', {'scenes': ['zeta', 'alpha'], 'others': True}),
        (['--all'], b'ignored\\0', {'scenes': ['zeta', 'alpha'], 'others': True}),
    ]:
        output = subprocess.check_output(command + args, input=data)
        assert len(output.splitlines()) == 1, output
        assert json.loads(output) == expected, (args, data, output)
    process = subprocess.Popen(command + ['--all'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        assert process.wait(timeout=5) == 0
        assert json.loads(process.stdout.read()) == {'scenes': ['zeta', 'alpha'], 'others': True}
    finally:
        process.kill() if process.poll() is None else None
        process.communicate()
`);
});

const plan = JSON.parse(readFileSync("tools/generators.json", "utf8")) as {
  generators: { id?: string }[];
};
const hasScenes = plan.generators.some((entry) =>
  entry.id?.startsWith("render_preview.py:"),
);

// 5/6 introduces the per-scene manifest entries this integration test requires.
it.skipIf(!hasScenes)(
  "selects all real manifest scenes for shared changes",
  () => {
    const result = JSON.parse(
      python(`
import json, sys
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest
from select_model_scenes import select
manifest = OutputManifest.load()
expected = [entry.id.split(':', 1)[1] for entry in manifest.entries()
            if entry.id.startswith('render_preview.py:')]
for path in ${JSON.stringify(sharedPaths)}:
    result = select([path], manifest)
    assert list(result.scenes) == expected, path
    assert result.others, path
print(json.dumps(expected))
`),
    ) as string[];
    expect(result.length).toBeGreaterThan(0);
  },
);
