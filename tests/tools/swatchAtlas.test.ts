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

it("preserves the original SUV swatch layout and pixels for every paint", () => {
  run(`suv_atlas = load_tool('suv_atlas')
suv_palette = load_tool('suv_palette')
suv_export = load_tool('suv_export')
assert suv_atlas.ATLAS.width == 128 and suv_atlas.ATLAS.height == 16
for i, name in enumerate(suv_palette.NAMES):
    faces = suv_atlas.uv(name)
    assert set(faces) == {'north', 'south', 'east', 'west', 'up', 'down'}
    assert all(face == {'uv': [i * 4 + 1, 1], 'uv_size': [2, 2]} for face in faces.values())
    assert len({id(face) for face in faces.values()}) == 6
for paint in suv_palette.BODY_PAINTS:
    colors = {**suv_palette.PALETTE, 'body': paint.body}
    pixel = suv_export.paint_pixel(paint.body)
    for y in range(16):
        for x in range(128):
            expected = (0, 0, 0, 255)
            if y < 4 and x // 4 < len(suv_palette.NAMES):
                name = suv_palette.NAMES[x // 4]
                expected = (*colors[name], suv_palette.ALPHA.get(name, 255))
            assert pixel(x, y) == expected`);
}, 120_000);

it("pins camper defaults and rejects invalid placements without mutation", () => {
  run(`a = m.Atlas(['a', 'b'])
assert (a.width, a.height) == (2, 1)
a.allocate('one', 3, 2)
a.allocate('two', 2, 1)
assert a.regions == (m.Region('one', 0, 1, 3, 2), m.Region('two', 0, 3, 2, 1))
assert (a.width, a.height) == (3, 4)
assert a.swatch_uv('a') == [0, 0] and a.swatch_uv('b') == [1, 0]
assert a.swatch_at(1, 0) == 1 and a.swatch_at(2, 0) is None and a.swatch_at(0, 1) is None
assert a.face('b') == {'uv': [1, 0], 'uv_size': [1, 1]}
colors = {'a': (1, 2, 3, 4), 'b': (5, 6, 7, 8)}
pixel = lambda r, x, y: (r.name, x, y)
assert a.pixel(colors, 1, 0) == (5, 6, 7, 8)
assert a.pixel(colors, 2, 3, pixel) == (0, 0, 0, 0)
assert a.pixel(colors, 1, 2, pixel) == ('one', 1, 1)
def build():
    b = m.Atlas(['a'], cell=4, width=12, height=10)
    b.place('panel', 2, 4, 3, 2)
    return b
for args in [('x', -1, 4, 1, 1), ('x', 12, 4, 1, 1), ('x', 0, 10, 1, 1), ('x', 0, 3, 1, 1), ('x', 3, 5, 1, 1), ('panel', 0, 7, 1, 1), ('a', 0, 7, 1, 1)]:
    b = build()
    before = b.regions
    try: b.place(*args)
    except ValueError: pass
    else: raise AssertionError(args)
    assert b.regions == before
    if args[0] == 'x': assert b.place('x', 0, 7, 1, 1) == m.Region('x', 0, 7, 1, 1)
b = build()
before = b.regions
try: b.allocate('overflow', 1, 5)
except ValueError: pass
else: raise AssertionError('expected overflow')
assert b.regions == before
assert b.allocate('overflow', 1, 1) == m.Region('overflow', 0, 6, 1, 1)
try: m.Atlas(['a', 'b'], cell=4, width=7)
except ValueError: pass
else: raise AssertionError('expected overflow')`);
});

it("packs blocks on shelves, samples local pixels, and preserves names and state on failure", () => {
  run(`def build():
    a = m.Atlas(['a'], width=20, height=15)
    b = a.block('block', 2, 3, 10, 6)
    b.allocate('one', 6, 2)
    b.allocate('two', 4, 3)
    b.allocate('three', 5, 2)
    return a, b
a, b = build()
assert b.regions == (m.Region('one', 2, 3, 6, 2), m.Region('two', 8, 3, 4, 3), m.Region('three', 2, 6, 5, 2))
assert a.regions == (b.region,)
pixel = lambda r, x, y: (r.name, x, y)
assert a.pixel({'a': (1,)}, 3, 7, pixel) == ('three', 1, 1)
assert a.pixel({}, 11, 8, pixel) == (0, 0, 0, 0)
for target, args in [('block', ('too_big', 11, 1)), ('block', ('wrap_fail', 6, 10)), ('block', ('one', 1, 1)), ('block', ('a', 1, 1)), ('atlas', ('three', 15, 3, 1, 1)), ('block', ('block', 1, 1))]:
    a, b = build()
    before = (a.regions, b.regions)
    try: (b.allocate if target == 'block' else a.place)(*args)
    except ValueError: pass
    else: raise AssertionError('expected rejection')
    assert (a.regions, b.regions) == before
    _, fresh = build()
    assert b.allocate('next', 3, 1) == fresh.allocate('next', 3, 1)
    if args[0] in ('too_big', 'wrap_fail'): assert b.allocate(args[0], 1, 1).name == args[0]`);
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
    except ValueError:
        assert a.regions == before and str(i) not in a._names
for i, r in enumerate(a.regions):
    assert r.x >= 0 and r.y >= 1 and r.x + r.w <= 16 and r.y + r.h <= 16
    for s in a.regions[:i]:
        assert r.x + r.w <= s.x or s.x + s.w <= r.x or r.y + r.h <= s.y or s.y + s.h <= r.y
b = m.Atlas(['a']).block('b', 3, 4, 10, 10)
for i, (_, _, w, h) in enumerate(${JSON.stringify(rects)}):
    before = b.regions
    cursor = (b._x, b._y, b._shelf_height)
    try: b.allocate(str(i), w, h)
    except ValueError:
        assert b.regions == before and str(i) not in b._atlas._names
        assert (b._x, b._y, b._shelf_height) == cursor
for i, r in enumerate(b.regions):
    assert r.x >= 3 and r.y >= 4 and r.x + r.w <= 13 and r.y + r.h <= 14
    for s in b.regions[:i]:
        assert r.x + r.w <= s.x or s.x + s.w <= r.x or r.y + r.h <= s.y or s.y + s.h <= r.y`);
      },
    ),
    { numRuns: 25 },
  );
}, 60_000);
