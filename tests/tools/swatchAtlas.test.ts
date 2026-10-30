import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { it } from "vitest";

const run = (script: string) =>
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      [
        "import sys",
        "sys.path.insert(0, 'tools')",
        "from tool_loader import load_tool",
        "m = load_tool('swatch_atlas')",
        script,
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );

it("matches every SUV swatch face and pixel for every paint", () => {
  run(`import contextlib, io, tempfile
with tempfile.TemporaryDirectory() as output:
    sys.argv = ['gen_model.py', output]
    with contextlib.redirect_stdout(io.StringIO()):
        g = load_tool('gen_model')
    atlas = m.Atlas(g.NAMES, cell=4, inset=1, width=g.TEXTURE_WIDTH, height=16, fill=(0,0,0,255))
    for name in g.NAMES:
        assert all(face == atlas.face(name) for face in g.uv(name).values())
    for body in g.BODY_PAINTS.values():
        palette = {**g.PALETTE, 'body': body}
        colors = {name: (*palette[name], g.ALPHA.get(name, 255)) for name in g.NAMES}
        for y in range(16):
            for x in range(g.TEXTURE_WIDTH):
                assert atlas.pixel(colors, x, y) == (*g.swatches(body)(x, y), 255)[:4]`);
}, 120_000);

it("preserves camper defaults and rejects invalid placements without mutation", () => {
  run(`old = load_tool('camper_atlas').Atlas(['a', 'b'])
a = m.Atlas(['a', 'b'])
for atlas in (old, a):
    atlas.allocate('one', 3, 2)
    atlas.allocate('two', 2, 1)
assert old.regions == a.regions and old.face('b') == a.face('b')
assert a.regions == (m.Region('one', 0, 1, 3, 2), m.Region('two', 0, 3, 2, 1))
b = m.Atlas(['a'], cell=4, width=12, height=10)
b.place('panel', 2, 4, 3, 2)
for args in [('x', -1, 4, 1, 1), ('x', 12, 4, 1, 1), ('x', 0, 10, 1, 1), ('x', 0, 3, 1, 1), ('x', 3, 5, 1, 1), ('panel', 0, 7, 1, 1), ('a', 0, 7, 1, 1)]:
    before = b.regions
    try: b.place(*args)
    except ValueError: pass
    else: raise AssertionError(args)
    assert b.regions == before
for call in (lambda: b.allocate('overflow', 1, 5), lambda: m.Atlas(['a', 'b'], cell=4, width=7)):
    before = b.regions
    try: call()
    except ValueError: pass
    else: raise AssertionError('expected overflow')
    assert b.regions == before`);
});

it("packs blocks on shelves, samples local pixels, and preserves names and state on failure", () => {
  run(`a = m.Atlas(['a'], width=20, height=15)
b = a.block('block', 2, 3, 10, 6)
r1 = b.allocate('one', 6, 2)
r2 = b.allocate('two', 4, 3)
r3 = b.allocate('three', 5, 2)
assert b.regions == (m.Region('one', 2, 3, 6, 2), m.Region('two', 8, 3, 4, 3), m.Region('three', 2, 6, 5, 2))
assert a.regions == (b.region,)
pixel = lambda r, x, y: (r.name, x, y)
assert a.pixel({'a': (1,)}, 3, 7, pixel) == ('three', 1, 1)
assert a.pixel({}, 11, 8, pixel) == (0, 0, 0, 0)
for call in (lambda: b.allocate('too_big', 11, 1), lambda: b.allocate('one', 1, 1), lambda: b.allocate('a', 1, 1), lambda: a.place('three', 15, 3, 1, 1), lambda: b.allocate('block', 1, 1)):
    before = (a.regions, b.regions)
    try: call()
    except ValueError: pass
    else: raise AssertionError('expected rejection')
    assert (a.regions, b.regions) == before`);
});

it("keeps random placements and block allocations contained and disjoint", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.tuple(
          fc.integer({ min: -2, max: 15 }),
          fc.integer({ min: 0, max: 15 }),
          fc.integer({ min: 1, max: 8 }),
          fc.integer({ min: 1, max: 8 }),
        ),
        { maxLength: 20 },
      ),
      (rects) => {
        run(`a = m.Atlas(['a'], width=16, height=16)
for i, (x, y, w, h) in enumerate(${JSON.stringify(rects)}):
    before = a.regions
    try: a.place(str(i), x, y, w, h)
    except ValueError: assert a.regions == before
for i, r in enumerate(a.regions):
    assert r.x >= 0 and r.y >= 1 and r.x + r.w <= 16 and r.y + r.h <= 16
    for s in a.regions[:i]:
        assert r.x + r.w <= s.x or s.x + s.w <= r.x or r.y + r.h <= s.y or s.y + s.h <= r.y
b = m.Atlas(['a']).block('b', 3, 4, 10, 10)
for i, (_, _, w, h) in enumerate(${JSON.stringify(rects)}):
    before = b.regions
    try: b.allocate(str(i), w, h)
    except ValueError: assert b.regions == before
for i, r in enumerate(b.regions):
    assert r.x >= 3 and r.y >= 4 and r.x + r.w <= 13 and r.y + r.h <= 14
    for s in b.regions[:i]:
        assert r.x + r.w <= s.x or s.x + s.w <= r.x or r.y + r.h <= s.y or s.y + s.h <= r.y`);
      },
    ),
    { numRuns: 25 },
  );
}, 60_000);
