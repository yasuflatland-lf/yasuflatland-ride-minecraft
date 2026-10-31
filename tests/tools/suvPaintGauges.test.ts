import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

const run = (script: string) =>
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import sys, json\nsys.path.insert(0, 'tools')\nfrom tool_loader import load_tool\n${script}`,
    ],
    { encoding: "utf8" },
  );

it.each(["tach", "speed", "fuel_temp"])(
  "keeps %s ticks inside the dial and preserves the declared count",
  (name) => {
    run(`p = load_tool('suv_paint_gauges')
name = '${name}'
size = next(spec.w for spec in p.REGIONS if spec.name == name)
paint = load_tool('suv_palette').BODY_PAINTS[0]
tick = (*load_tool('suv_palette').PALETTE['gauge'], 255)
marks = p.tick_marks(name)
assert len(marks) == {'tach': p.TICKS_TACH, 'speed': p.TICKS_SPEED, 'fuel_temp': p.TICKS_FUEL_TEMP}[name]
assert len(set(marks)) == len(marks)
assert all(0 <= u < size and 0 <= v < size and p.inside(size, u, v) and p.color(name, u, v, paint) == tick for mark in marks for u, v in mark)
assert all(p.color(name, u, v, paint) != tick for v in range(size) for u in range(size) if not p.inside(size, u, v))`);
  },
);

it("maps every rim face to leather", () => {
  expect(
    run(`a = load_tool('suv_atlas')
c = load_tool('suv_cabin')
r = a.region('gauges', 'leather')
expected = a.ATLAS.face(r, (0, 0), (8, 8))
rim = c.steering_cubes()[:16]
assert len(rim) == 16
assert all(len(cube['uv']) == 6 and all(face == expected for face in cube['uv'].values()) for cube in rim)
print('ok')`).trim(),
  ).toBe("ok");
});

it("paints gauges deterministically across processes", () => {
  const script = `import hashlib
p = load_tool('suv_paint_gauges')
paint = load_tool('suv_palette').BODY_PAINTS[0]
pixels = bytes(channel for spec in p.REGIONS for v in range(spec.h) for u in range(spec.w) for channel in p.color(spec.name, u, v, paint))
print(hashlib.sha256(pixels).hexdigest())`;
  expect(run(script)).toBe(run(script));
});

it("keeps a round hub inside the rim with its highlight ahead of the spokes", () => {
  run(`import math
c = load_tool('suv_cabin')
a = load_tool('suv_atlas')
r = a.region('gauges', 'hub')
hub = [cube for cube in c.steering_cubes() if cube['uv']['south']['uv'] == [r.x, r.y]]
assert len(hub) == 16
assert c.HUB_RADIUS == 1
half = c.HUB_RADIUS / math.sqrt(2)
for i, cube in enumerate(hub):
    assert cube['pivot'] == c.WHEEL_PIVOT
    assert cube['rotation'] == c.tilted_spin(i * 90 / 16)
    assert all(math.isclose(n, half * 2) for n in cube['size'][:2])
    assert cube['origin'][2] < c.WHEEL_Z - 0.5
    assert math.isclose(cube['origin'][2] + cube['size'][2], c.HUB_BACK)
assert hub[0]['origin'][2] < min(cube['origin'][2] for cube in hub[1:])
for degree in range(3600):
    angle = math.radians(degree / 10)
    reach = max(half / max(abs(math.cos(angle - math.radians(i * 90 / 16))),
                           abs(math.sin(angle - math.radians(i * 90 / 16)))) for i in range(16))
    assert 0.95 <= reach <= c.HUB_RADIUS + 1e-10
    assert reach < c.WHEEL_RADIUS - 0.35
assert hub[0]['uv']['north'] == a.ATLAS.face(r, (0, 0), (16, 16))`);
});

it("gives every hub texel neutral black color and glossy non-emissive MER in every paint", () => {
  run(`a = load_tool('suv_atlas')
t = load_tool('suv_texture')
m = load_tool('suv_material')
p = load_tool('suv_palette')
r = a.region('gauges', 'hub')
assert tuple(r) == ('hub', 416, 168, 16, 16)
assert [tuple(a.region('gauges', name)) for name in ('tach', 'fuel_temp', 'speed', 'leather')] == [
    ('tach', 320, 168, 32, 32), ('fuel_temp', 352, 168, 24, 24),
    ('speed', 376, 168, 32, 32), ('leather', 408, 168, 8, 8)]
for paint in p.BODY_PAINTS:
    values = set()
    for v in range(r.h):
        for u in range(r.w):
            x, y = r.x + u, r.y + v
            red, green, blue, alpha = t.paint_pixel(paint)(x, y)
            assert 8 <= red == green == blue <= 20 and alpha == 255
            values.add(red)
            assert m.mer_pixel(paint)(x, y) == (35, 0, 45, 255)
            assert not t.is_lit(x, y)
            if u in (0, 15) or v in (0, 15): assert red == 8
    assert min(values) == 8 and max(values) == 20`);
});
