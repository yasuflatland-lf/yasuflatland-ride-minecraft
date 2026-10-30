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
assert all(0 <= u < size and 0 <= v < size and p.in_dial(size, u, v) and p.color(name, u, v, paint) == tick for mark in marks for u, v in mark)
assert all(p.color(name, u, v, paint) != tick for v in range(size) for u in range(size) if not p.in_dial(size, u, v))`);
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
