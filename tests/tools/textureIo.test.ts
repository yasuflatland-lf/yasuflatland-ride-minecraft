import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("records writes and checks, preserving rendered RGB and RGBA PNG bytes", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import struct, sys, tempfile, zlib
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
io = load_tool('texture_io')
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    pixels = bytes((10, 20, 30, 255, 40, 50, 60, 255))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    for rgb in (False, True):
        path = root / f'{rgb}.png'
        write = io.Outputs(False)
        write.rgba(path, 2, 1, pixels, rgb=rgb)
        raw = bytes(c for i, c in enumerate(pixels) if not rgb or i % 4 != 3)
        expected = (b'\\x89PNG\\r\\n\\x1a\\n'
                    + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 1, 8, 2 if rgb else 6, 0, 0, 0))
                    + chunk(b'IDAT', zlib.compress(b'\\0' + raw, 9)) + chunk(b'IEND', b''))
        assert path.read_bytes() == expected
        assert write.touched == [path]
        check = io.Outputs(True)
        check.rgba(path, 2, 1, pixels, rgb=rgb)
        missing = root / 'missing.json'
        check.json(missing, {})
        assert check.touched == [path, missing]
        assert len(check.stale) == 1
        assert not missing.exists()
`,
  ]);
});

it("compares JSON and PNG content and reports every stale file", () => {
  const script = `
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
io = load_tool('texture_io')
with tempfile.TemporaryDirectory() as d:
 p = Path(d)
 pixel = lambda x, y: (x, y, 20, 255)
 write = io.Outputs(False)
 write.png(p / 'a.png', 32, 32, pixel, 0)
 write.png(p / 'b.png', 32, 32, pixel, 9)
 assert (p / 'a.png').read_bytes() != (p / 'b.png').read_bytes()
 (p / 'a.json').write_text('{ "b": 2, "a": 1 }')
 check = io.Outputs(True)
 check.json(p / 'a.json', {'a': 1, 'b': 2})
 check.png(p / 'a.png', 32, 32, pixel, 9)
 check.png(p / 'b.png', 32, 32, pixel, 0)
 assert not check.stale
 check.json(p / 'a.json', {})
 check.png(p / 'a.png', 1, 1, pixel)
 check.json(p / 'missing.json', {})
 try:
  check.finish('Stale:', 'ok')
 except SystemExit as e:
  print(str(e).replace(str(p), 'DIR'))
`;
  expect(
    execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }).trim(),
  ).toMatch(
    /^Stale:\nDIR\/a\.json\nDIR\/a\.png\nDIR\/missing\.json \(.*No such file.*\)$/,
  );
});

it("accepts one relief variant and preserves texture sets without relief", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import sys, tempfile, json
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
io = load_tool('texture_io')
base = {'color': 'paint', 'metalness_emissive_roughness': 'mer'}
assert io.texture_set_doc('paint', 'mer')['minecraft:texture_set'] == base
for kind in ('heightmap', 'normal'):
    with tempfile.TemporaryDirectory() as d:
        io.write_texture_set(io.Outputs(False), Path(d), 'paint', 'mer', (kind, 'relief'))
        doc = json.loads((Path(d) / 'paint.texture_set.json').read_text())
        assert doc['minecraft:texture_set'] == {**base, kind: 'relief'}
try:
    io.texture_set_doc('paint', 'mer', ('unknown', 'relief'))
except ValueError:
    pass
else:
    raise AssertionError('Unknown relief kind accepted')
`,
  ]);
});

it("writes compact UTF-8 documents and indented fixtures with semantic freshness checks", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'tools')
from texture_io import Outputs
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    documents = [{'label': 'caf\u00e9', 'values': (1, 2.5, None, True)}, '{"a":1}', [], {}]
    for index, doc in enumerate(documents):
        for method, options in [('json', {'separators': (',', ':')}), ('fixture_json', {'indent': 2})]:
            path = root / method / f'{index}.json'
            write = Outputs(False)
            getattr(write, method)(path, doc)
            expected = json.dumps(doc, ensure_ascii=False, **options) + '\\n'
            assert path.read_bytes() == expected.encode('utf-8')
            assert write.touched == [path]
            path.write_text(json.dumps(doc, indent=4, ensure_ascii=True))
            before = path.read_bytes()
            check = Outputs(True)
            getattr(check, method)(path, doc)
            assert not check.stale
            assert check.touched == [path]
            assert path.read_bytes() == before
            path.write_text('invalid JSON')
            getattr(check, method)(path, doc)
            assert len(check.stale) == 1
            path.write_text('null')
            getattr(check, method)(path, doc)
            assert check.stale[-1] == str(path)
`,
  ]);
});
