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
        "import sys, json",
        "sys.path.insert(0, 'tools')",
        "from tool_loader import load_tool",
        script,
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );

it("maps subrectangles, rejects unknown faces, and isolates face dictionaries", () => {
  run(`from copy import deepcopy
c = load_tool('suv_cubes')
a = load_tool('suv_atlas')
faces = c.region_faces('dash', 'grain', {'east': (2, 3, 8, 12)})
assert faces['east'] == {'uv': [194, 171], 'uv_size': [8, 12]}
assert all(face == a.ATLAS.face('resin') for name, face in faces.items() if name != 'east')
try: c.region_faces('dash', 'grain', {'invalid': (0, 0, 1, 1)})
except ValueError: pass
else: raise AssertionError('unknown face accepted')
cube = c.box(1, 2, 3, 4, 5, 6, faces)
original = deepcopy(cube)
mirror = c.mirrored(cube)
assert set(mirror['uv']) == set(faces)
assert mirror['uv']['west'] == faces['east']
assert mirror['uv']['east'] == faces['west']
assert all(mirror['uv'][name] == faces[name] for name in faces if name not in ('east', 'west'))
turned = deepcopy(cube)
load_tool('suv_export').turn_around([{'cubes': [turned]}])
assert set(turned['uv']) == set(faces)
assert turned['uv']['west'] == {'uv': [202, 171], 'uv_size': [-8, 12]}
assert turned['uv']['east'] == faces['west']
for transform in (c.mirrored, c.facing_back):
    other = transform(cube)
    other['uv']['east']['uv'][0] += 1
    other['size'][0] += 1
    assert cube == original
assert cube['uv'] == faces
cube['uv']['east']['uv'][0] += 1
assert faces['east']['uv'][0] == 194`);
});

it("keeps asymmetric markers at the reflected world positions on every face", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 1, max: 10 }),
      (w, d) => {
        run(`from copy import deepcopy
c = load_tool('suv_cubes')
e = load_tool('suv_export')
r = load_tool('render_preview')
names = ('north', 'south', 'east', 'west', 'up', 'down')
faces = c.region_faces('dash', 'grain', {name: (3, 5, 8, 12) for name in names})
cube = c.box(2, 3, -20, 2 + ${w}, 11, -20 + ${d}, faces)
# Mark near u=0 and near the top; a second mark catches reversed vertical orientation.
texture = [[(0, 0, 0, 255)] * 512 for _ in range(256)]
texture[174][195] = (255, 0, 0, 255)
texture[182][201] = (0, 255, 0, 255)
def markers(cube, name):
    quad = dict(r.cube_faces(cube))[name]
    patches = r.textured_face(texture, cube['uv'][name], quad, name, 512, 256)
    return {color: tuple(sum(p[i] for p in patch) / 4 for i in range(3))
            for patch, color in patches if color in ((255, 0, 0, 255), (0, 255, 0, 255))}
def turn(cube):
    copy = deepcopy(cube)
    e.turn_around([{'cubes': [copy]}])
    return copy
for transform, signs, swaps in [
    (c.mirrored, (-1, 1, 1), {'east': 'west', 'west': 'east'}),
    (c.facing_back, (1, 1, -1), {'north': 'south', 'south': 'north'}),
    (turn, (-1, 1, -1), {'east': 'west', 'west': 'east', 'north': 'south', 'south': 'north'})]:
    rotations = ([0, 0, 0], [0, 23, 0]) if transform == c.facing_back else ([0, 0, 0], [17, 0, 0], [0, 23, 0], [0, 0, 31])
    for rotation in rotations:
        source = {**cube, 'pivot': [2, 3, -20], 'rotation': rotation}
        target = transform(source)
        for name in names:
            before = markers(source, name)
            after = markers(target, swaps.get(name, name))
            assert before.keys() == after.keys() and len(before) == 2
            for color, point in before.items():
                assert all(abs(after[color][i] - point[i] * signs[i]) < 1e-9 for i in range(3)), (name, rotation, before, after)
    assert transform(transform(cube)) == cube
# Before export, rear is -z. The marker stays at that end on both sides.
assert markers(cube, 'east')[(255, 0, 0, 255)][2] < -20 + ${d} / 2
assert markers(c.mirrored(cube), 'west')[(255, 0, 0, 255)][2] < -20 + ${d} / 2
assert markers(turn(cube), 'west')[(255, 0, 0, 255)][2] > 20 - ${d} / 2`);
      },
    ),
    { numRuns: 15 },
  );
}, 60_000);

it("preserves every swatch face key and value through all transforms", () => {
  run(`from copy import deepcopy
c = load_tool('suv_cubes')
e = load_tool('suv_export')
p = load_tool('suv_palette')
cube = c.box(1, 2, 3, 5, 7, 11, 'body')
for name, color in zip(cube['uv'], p.NAMES):
    cube['uv'][name] = c.atlas.ATLAS.face(color)
original = deepcopy(cube['uv'])
assert c.mirrored(cube)['uv'] == original
assert c.facing_back(cube)['uv'] == original
assert c.both_sides([cube])[1]['uv'] == original
e.turn_around([{'cubes': [cube]}])
assert cube['uv'] == original`);
});
