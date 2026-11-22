import fc from "fast-check";
import { afterAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const run = (script: string) =>
  python.run(
    [
      "import sys",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "m = load_tool('swatch_atlas')",
      script,
    ].join("\n"),
  );

const swatchGridDimensions = fc
  .record({
    count: fc.integer({ min: 1, max: 32 }),
    cell: fc.integer({ min: 1, max: 8 }),
  })
  .chain(({ count, cell }) =>
    fc
      .integer({ min: 0, max: Math.floor((cell - 1) / 2) })
      .map((inset) => ({ count, cell, inset })),
  );

it("rejects invalid swatch grid dimensions, indices, and mutations", async () => {
  await run(`import dataclasses

for count in (0, -1, True, 1.5):
    try: m.SwatchGrid(count)
    except ValueError: pass
    else: raise AssertionError(('expected invalid count', count))

for dimensions in (
    {'cell': 0}, {'cell': True}, {'inset': -1}, {'inset': 1.0},
    {'cell': 2, 'inset': 1}, {'columns': 0}, {'columns': True}, {'columns': 1.5},
):
    try: m.SwatchGrid(1, **dimensions)
    except ValueError: pass
    else: raise AssertionError(('expected invalid dimensions', dimensions))

grid = m.SwatchGrid(3, cell=4, columns=2)
for method in (grid.origin, grid.sample_rect):
    for index in (-1, grid.count):
        try: method(index)
        except IndexError: pass
        else: raise AssertionError(('expected invalid index', method.__name__, index))

try: grid.count = 4
except dataclasses.FrozenInstanceError: pass
else: raise AssertionError('expected the grid to be frozen')

try: m.Atlas(['a', 'b', 'c'], cell=4, columns=2, height=7)
except ValueError: pass
else: raise AssertionError('expected rejection for an atlas shorter than its swatch grid')`);
});

it("keeps sampled texels inside the grid and maps each texel to its own swatch", async () => {
  await fc.assert(
    fc.asyncProperty(
      swatchGridDimensions,
      fc.integer({ min: 1, max: 40 }),
      async ({ count, cell, inset }, columns) => {
        await run(`grid = m.SwatchGrid(${count}, ${cell}, ${inset}, ${columns})
sampled = set()
for i in range(grid.count):
    x, y, w, h = grid.sample_rect(i)
    assert 0 <= x < x + w <= grid.width
    assert 0 <= y < y + h <= grid.height
    for py in range(y, y + h):
        for px in range(x, x + w):
            assert (px, py) not in sampled
            sampled.add((px, py))
            assert grid.index_at(px, py) == i`);
      },
    ),
  );
});

it("maps every grid texel to its swatch and rejects empty cells and out-of-bounds texels", async () => {
  await fc.assert(
    fc.asyncProperty(
      swatchGridDimensions,
      fc.integer({ min: 1, max: 40 }),
      async ({ count, cell, inset }, columns) => {
        await run(`grid = m.SwatchGrid(${count}, ${cell}, ${inset}, ${columns})
for y in range(grid.height):
    for x in range(grid.width):
        index = (y // grid.cell) * grid.columns + (x // grid.cell)
        assert grid.index_at(x, y) == (index if index < grid.count else None)
    assert grid.index_at(-1, y) is None
    assert grid.index_at(grid.width, y) is None
for x in range(grid.width):
    assert grid.index_at(x, -1) is None
    assert grid.index_at(x, grid.height) is None`);
      },
    ),
  );
});

it("preserves the original one-row layout with implicit or explicit columns", async () => {
  await fc.assert(
    fc.asyncProperty(swatchGridDimensions, async ({ count, cell, inset }) => {
      await run(`for columns in (None, ${count}):
    grid = m.SwatchGrid(${count}, ${cell}, ${inset}, columns)
    assert (grid.width, grid.rows, grid.height) == (${count * cell}, 1, ${cell})
    for i in range(grid.count):
        assert grid.origin(i) == (i * ${cell}, 0)
        assert grid.sample_rect(i) == (i * ${cell} + ${inset}, ${inset}, ${cell - 2 * inset}, ${cell - 2 * inset})`);
    }),
  );
});

it("uses the wrapped grid for faces, pixels, and region placement", async () => {
  await run(`a = m.Atlas(['a', 'b', 'c'], cell=4, inset=1, columns=2)
assert (a.width, a.swatch_rows, a.height) == (8, 8, 8)
assert a.swatch_uv('c') == [0, 4]
assert a.face('c') == {'uv': [1, 5], 'uv_size': [2, 2]}
assert a.swatch_at(0, 4) == 2
assert a.swatch_at(4, 4) is None
assert a.swatch_at(8, 0) is None
assert a.swatch_at(0, 8) is None
assert a.pixel({'c': (1, 2, 3, 4)}, 0, 4) == (1, 2, 3, 4)
assert a.pixel({}, 4, 4) == a.fill
try: a.place('unused cell', 4, 4, 1, 1)
except ValueError: pass
else: raise AssertionError('expected rejection inside the swatch rows')
assert a.allocate('panel', 1, 1) == m.Region('panel', 0, 8, 1, 1)`);
});

it("resolves registered swatches from atlas coordinates and falls back to local coordinates", async () => {
  await run(`import types

camper_atlas = load_tool('camper_atlas')
a = camper_atlas.RegisteredAtlas(['a', 'b', 'c'], cell=4, inset=1, columns=2)
a.base_ref = types.SimpleNamespace(
    _registry=types.SimpleNamespace(
        _layout=types.SimpleNamespace(origin=lambda name: (5, 7)),
    ),
)
for y in range(a.height + 2):
    for x in range(a.width + 2):
        assert a.atlas_swatch_at(5 + x, 7 + y) == a.swatch_at(x, y)

a.base_ref = None
for y in range(a.height + 2):
    for x in range(a.width + 2):
        assert a.atlas_swatch_at(x, y) == a.swatch_at(x, y)`);
});

it("preserves the original SUV swatch layout and pixels for every paint", async () => {
  await run(`suv_atlas = load_tool('suv_atlas')
suv_palette = load_tool('suv_palette')
assert suv_atlas.ATLAS.width == 512 and suv_atlas.ATLAS.height == 256
for i, name in enumerate(suv_palette.NAMES):
    faces = suv_atlas.uv(name)
    assert set(faces) == {'north', 'south', 'east', 'west', 'up', 'down'}
    assert all(face == {'uv': [i * 4 + 1, 1], 'uv_size': [2, 2]} for face in faces.values())
    assert len({id(face) for face in faces.values()}) == 6
for paint in suv_palette.BODY_PAINTS:
    colors = {**suv_palette.PALETTE, 'body': paint.body}
    pixel = load_tool("suv_texture").paint_pixel(paint)
    for y in range(8):
        for x in range(128):
            expected = (0, 0, 0, 255)
            if y < 4 and x // 4 < len(suv_palette.NAMES):
                name = suv_palette.NAMES[x // 4]
                expected = (*colors[name], suv_palette.ALPHA.get(name, 255))
            assert pixel(x, y) == expected`);
});

it("pins camper defaults and rejects invalid placements without mutation", async () => {
  await run(`a = m.Atlas(['a', 'b'])
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

it("packs blocks on shelves, samples local pixels, and preserves names and state on failure", async () => {
  await run(`def build():
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

it("keeps random placements and block allocations contained and disjoint", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.tuple(
          fc.integer({ min: -2, max: 15 }),
          fc.integer({ min: 0, max: 15 }),
          fc.integer({ min: 1, max: 8 }),
          fc.integer({ min: 1, max: 8 }),
        ),
        { maxLength: 20 },
      ),
      async (rects) => {
        await run(`a = m.Atlas(['a'], width=16, height=16)
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
});
