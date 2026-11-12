import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
a = load_tool('gear_atlas')
p = load_tool('gear_paint')

def raises(call, message=None):
    try:
        call()
    except (ValueError, AssertionError) as error:
        if message is not None:
            assert message in str(error), str(error)
    else:
        raise AssertionError('Expected rejection')
`;

it("packs independently by item with nonoverlapping gutters, stable pixels and PNG bytes", async () => {
  expect(
    await python.run(`${setup}
from tempfile import TemporaryDirectory
from pathlib import Path
io = load_tool('texture_io')
assert (a.ATLAS_SIZE, a.CELL, a.CELL_GUTTER, a.REGION_GUTTER, a.TEXELS_PER_PX, a.LETTERING_TEXELS_PER_PX) == (512, 128, 4, 2, 8, 16)
raises(lambda: a.tile('percolator', 3, 3), 'gear_registry.build')
raises(lambda: a.tile('unknown', 3, 3))
for item in a.GEAR_TILES:
    a.begin(item)
    for i, (w, h) in enumerate(((50, 12), (55, 20), (15, 35), (40, 25), (30, 10))):
        t = a.tile(item, w, h)
        assert not any(t.pixels)
        p.linear_gradient(t, (10, 20, 30, 255), (230, 210, 190, 255), (0, 0), (w, h))
        assert t.uv(w, h, 0, 0) == {'uv': [t.x + w, t.y + h], 'uv_size': [-w, -h]}
        raises(lambda: t.uv(-1, 0, 0, 0))
    assert a.tiles()[-3].y > a.tiles()[-4].y
    raises(lambda: a.tile(item, 117, 1), item)
    raises(lambda: a.tile(item, 1, 117), item)
    raises(lambda: a.tile(item, 116, 116), item)
    raises(lambda: a.tile(item, 0, 1), item)
regions = a.tiles()
assert isinstance(regions, tuple)
assert [t.item_id for t in regions] == [item for item in a.GEAR_TILES for _ in range(5)]
data = a.atlas_pixels()
assert data == a.atlas_pixels()
def pixel(x, y):
    return data[(y * 512 + x) * 4:(y * 512 + x + 1) * 4]
for i, t in enumerate(regions):
    n = a.GEAR_TILES[t.item_id]
    cx, cy = 128 * (n % 4), 128 * (n // 4)
    assert 0 <= cx + 4 <= t.x - 2 < t.x + t.width + 2 <= cx + 124 <= 512
    assert 0 <= cy + 4 <= t.y - 2 < t.y + t.height + 2 <= cy + 124 <= 512
    for other in regions[i + 1:]:
        assert (t.x + t.width + 2 <= other.x - 2 or other.x + other.width + 2 <= t.x - 2
                or t.y + t.height + 2 <= other.y - 2 or other.y + other.height + 2 <= t.y - 2)
    for y in range(-2, t.height + 2):
        for x in range(-2, t.width + 2):
            assert pixel(t.x + x, t.y + y) == bytes(t.get(min(max(x, 0), t.width - 1), min(max(y, 0), t.height - 1)))
for n in a.GEAR_TILES.values():
    cx, cy = 128 * (n % 4), 128 * (n // 4)
    for y in range(128):
        for x in range(128):
            if x < 4 or x >= 124 or y < 4 or y >= 124:
                assert pixel(cx + x, cy + y) == pixel(cx + min(max(x, 4), 123), cy + min(max(y, 4), 123))
for n in set(range(1, 16)) - set(a.GEAR_TILES.values()):
    assert all(pixel(128 * (n % 4) + x, 128 * (n // 4) + y) == bytes(4) for y in range(128) for x in range(128))
with TemporaryDirectory() as directory:
    first, second = Path(directory) / 'a.png', Path(directory) / 'b.png'
    out = io.Outputs(False)
    out.png(first, 512, 512, pixel, compress_level=9)
    out.png(second, 512, 512, pixel, compress_level=9)
    assert first.read_bytes() == second.read_bytes()
# Rebuilding one item clears only its reservations and reproduces its first slot.
first = regions[0]
a.begin(first.item_id)
rebuilt = a.tile(first.item_id, first.width, first.height)
assert (rebuilt.x, rebuilt.y) == (first.x, first.y)
assert len(a.tiles()) == len(regions) - 4
# Full usable-area footprint exercises all four cell corners, including the far edges.
a.begin('toaster')
t = a.tile('toaster', 116, 116)
p.linear_gradient(t, (10, 20, 30, 255), (80, 90, 100, 255), (0, 0), (116, 116))
data = a.atlas_pixels()
for y in range(128):
    for x in range(128):
        assert pixel(256 + x, y) == bytes(t.get(min(max(x - 6, 0), 115), min(max(y - 6, 0), 115)))
# Reservation order across items cannot affect the returned order or positions.
for item in reversed(a.GEAR_TILES):
    a.begin(item)
    a.tile(item, 1, 1)
assert [t.item_id for t in a.tiles()] == list(a.GEAR_TILES)
print('ok')
`),
  ).toBe("ok\n");
});

it("pads cutouts by nearest visible RGB with deterministic ties and checks every alpha boundary", async () => {
  expect(
    await python.run(`${setup}
a.begin('percolator')
t = a.tile('percolator', 5, 3)
t.set(0, 1, (200, 10, 20, 255))
t.set(4, 1, (20, 10, 200, 128))
original = bytes(t.pixels)
padded = a.pad_cutouts(t)
for y in range(3):
    for x in range(5):
        offset = (y * 5 + x) * 4
        assert tuple(padded[offset:offset + 3]) == ((200, 10, 20) if x <= 2 else (20, 10, 200))
        assert padded[offset + 3] == t.get(x, y)[3]
assert bytes(t.pixels) == original
assert a.check_alpha('percolator', False)
assert not a.check_alpha('percolator', True)
data = a.atlas_pixels()
offset = (t.y * 512 + t.x + 2) * 4
assert tuple(data[offset:offset + 4]) == (200, 10, 20, 0)
for alpha in range(256):
    t.set(4, 1, (20, 10, 200, alpha))
    assert bool(a.check_alpha('percolator', False)) == (alpha not in (0, 255))
    assert bool(a.check_alpha('percolator', True)) == (alpha not in (0, 255) and not 64 <= alpha <= 192)
a.begin('percolator')
empty = a.tile('percolator', 2, 2)
empty.set(0, 0, (1, 2, 3, 0))
assert a.pad_cutouts(empty) == empty.pixels
a.begin('percolator')
assert not a.check_alpha('percolator', False)
assert not any(a.atlas_pixels()[128 * 4:256 * 4])
# Validation uses the same cached atlas as the registry and item modules.
generator = load_tool('gen_camping_gear')
a.begin('percolator')
t = a.tile('percolator', 1, 1)
t.set(0, 0, (1, 2, 3, 12))
import json
rows = json.loads(generator.SPEC.read_text())
try:
    generator.validate(rows)
except SystemExit as error:
    assert 'invalid alpha 12' in str(error)
else:
    raise AssertionError('Validation accepted partial alpha')
print('ok')
`),
  ).toBe("ok\n");
});

it("paints each primitive deterministically with clipping, pixel centers and fixed bitmap lettering", async () => {
  expect(
    await python.run(`${setup}
from math import hypot
color = (100, 120, 140, 255)
operations = [
    lambda t: p.fill(t, color, -5, -2, 8.5, 7.5),
    lambda t: p.linear_gradient(t, (0, 0, 0, 0), color, (0, 0), (12, 8), (1, 1, 20, 15)),
    lambda t: p.radial_gradient(t, color, (0, 0, 0, 0), (8, 8), 6),
    lambda t: p.polygon(t, [(-2, 0), (12, 1), (8, 14)], color),
    lambda t: p.ellipse(t, (8, 8), (6, 4), color),
    lambda t: p.line(t, (-1, 0), (15, 12), color, 2),
    lambda t: p.rounded_rect(t, -2, 1, 15, 14, 3, color),
    lambda t: p.noise(t, 42, 20),
    lambda t: p.cutout(t, lambda x, y: x + y < 10),
    lambda t: p.text(t, -1, 1, 'AB', color, 2),
]
for operation in operations:
    buffers = []
    for _ in range(2):
        a.begin('toaster')
        t = a.tile('toaster', 16, 16)
        p.fill(t, (30, 30, 30, 255))
        operation(t)
        buffers.append(bytes(t.pixels))
    assert buffers[0] == buffers[1]
    assert buffers[0] != bytes((30, 30, 30, 255)) * 256
# Check coverage against independent geometric predicates across varied sizes.
for size in range(2, 18):
    a.begin('toaster')
    t = a.tile('toaster', size, size)
    p.ellipse(t, (size / 2, size / 2), (size / 2, size / 3), color)
    for y in range(size):
        for x in range(size):
            inside = ((x + .5 - size / 2) / (size / 2)) ** 2 + ((y + .5 - size / 2) / (size / 3)) ** 2 <= 1
            assert (t.get(x, y) == color) == inside
    p.fill(t, (0, 0, 0, 0))
    p.line(t, (1, 1), (1, 1), color, 2)
    for y in range(size):
        for x in range(size):
            assert (t.get(x, y) == color) == (hypot(x + .5 - 1, y + .5 - 1) <= 1)
a.begin('toaster')
t = a.tile('toaster', 8, 8)
p.fill(t, color, -2, -2, 1, 1)
assert t.get(0, 0) == color and t.get(1, 0) == (0, 0, 0, 0)
p.linear_gradient(t, (0, 20, 40, 255), (100, 120, 140, 255), (0, 0), (2, 0))
assert t.get(0, 0) == (25, 45, 65, 255)
assert t.get(1, 0) == (75, 95, 115, 255)
assert t.get(2, 0) == (100, 120, 140, 255)
p.radial_gradient(t, color, (0, 0, 0, 255), (.5, .5), 2)
assert t.get(0, 0) == color and t.get(2, 0) == (0, 0, 0, 255)
p.fill(t, (0, 0, 0, 0))
p.polygon(t, [(1, 1), (4, 1), (4, 4), (1, 4)], color)
assert sum(t.get(x, y) == color for y in range(8) for x in range(8)) == 9
p.fill(t, (0, 0, 0, 0))
p.rounded_rect(t, 0, 0, 8, 8, 3, color)
assert t.get(0, 0)[3] == 0 and t.get(3, 0) == color and t.get(7, 4) == color
p.fill(t, color)
p.cutout(t, lambda x, y: x < 1)
assert t.get(0, 0) == color[:3] + (0,) and t.get(1, 0) == color
a.begin('toaster')
t = a.tile('toaster', 80, 40)
for i, word in enumerate(('CANCEL', 'REHEAT', 'DEFROST', '0123456789')):
    assert p.text_width(word) == 4 * len(word) - 1
    assert p.text_width(word, 2, 3) == 9 * len(word) - 3
    p.text(t, 0, i * 8, word, color)
    assert any(t.get(x, i * 8 + y)[3] for x in range(p.text_width(word)) for y in range(5))
assert p.text_width('') == 0
assert set('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ -.:/+%') <= p.FONT.keys()
assert all(len(rows) == 5 and all(len(row) == 3 and set(row) <= set('#.') for row in rows) for rows in p.FONT.values())
raises(lambda: p.text_width('?'))
raises(lambda: p.text(t, 0, 0, '?', color))
results = []
for seed in (1, 1, 2):
    p.fill(t, color)
    p.noise(t, seed, 10)
    assert all(t.get(x, y)[3] == 255 and all(abs(t.get(x, y)[i] - color[i]) <= 10 for i in range(3)) for y in range(t.height) for x in range(t.width))
    results.append(bytes(t.pixels))
assert results[0] == results[1] != results[2]
print('ok')
`),
  ).toBe("ok\n");
});
