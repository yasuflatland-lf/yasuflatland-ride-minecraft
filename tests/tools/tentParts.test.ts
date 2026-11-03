import { afterAll, it } from "vitest";

import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const run = (script: string) =>
  python.run(
    [
      "import sys, json",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "tent = load_tool('gen_tent')",
      "dims = load_tool('tent_dims')",
      script,
    ].join("\n"),
  );

it("builds every tent part deterministically with cubes in bone order", async () => {
  await run(`from copy import deepcopy
for name in ('tent_body', 'tent_entrance', 'tent_tarp', 'tent_inner'):
    builder = load_tool(name)
    first = builder.build(dims.Dims(), tent.face)
    snapshot = deepcopy(first)
    second = builder.build(dims.Dims(), tent.face)
    assert first == snapshot == second, name
    assert first['cubes'] == [cube for bone in first['bones'].values() for cube in bone['cubes']], name
    first['cubes'][0]['origin'][0] += 1
    assert second == snapshot == builder.build(dims.Dims(), tent.face), name`);
});

it("assembles the committed tent bones and cubes in their original order", async () => {
  await run(`from pathlib import Path
committed = json.loads((Path('packs/yasu_ride_rp') / tent.GEOMETRY).read_text())
bones = committed['minecraft:geometry'][0]['bones']
assert tent.rounded(tent.assemble()) == bones
assert tent.geometry() == committed
for bone in tent.assemble()[1:]:
    assert list(bone) == ['name', 'parent', 'pivot', 'cubes']
    for cube in bone['cubes']:
        assert list(cube) == ['origin', 'size', 'uv'] + (['pivot', 'rotation'] if 'rotation' in cube else [])
        assert list(cube['uv']) == ['north', 'south', 'east', 'west', 'up', 'down']`);
});

it("keeps every tent dimension frozen", async () => {
  await run(`from dataclasses import FrozenInstanceError, fields
for field in fields(dims.DIMS):
    try:
        setattr(dims.DIMS, field.name, None)
    except FrozenInstanceError:
        pass
    else:
        raise AssertionError(f'{field.name} is mutable')
assert dims.DIMS == dims.Dims()`);
});

it("keeps the body slope linear from ground to ridge without moving flap pivots", async () => {
  await run(`from math import isclose
d = dims.DIMS
body = load_tool('tent_body')
for y in range(d.ridge_height + 1):
    assert isclose(body.half_width(d, y), d.half_width-d.lean*y/d.ridge_height)
    front, rear = body.ends(d, y)
    assert isclose(front-d.front_z, d.rear_z-rear)
    assert isclose(front-d.front_z, d.half_width-body.half_width(d, y))
bones = {bone['name']: bone for bone in tent.assemble()}
assert bones['flap_left']['pivot'] == [49.5, 26, -54]
assert bones['flap_right']['pivot'] == [-49.5, 26, -54]`);
});

it("keeps the triangular -x screen on its plane with bound seams and an open +x side", async () => {
  await run(`from dataclasses import replace
from math import isclose
tarp = load_tool('tent_tarp')
for height in (40, 44, 46):
    d = replace(dims.DIMS, tarp_front_height=height)
    b, c = tarp.screen_plane(d)
    assert isclose(-d.half_width+b*height+c*(d.tarp_front_z-d.front_z), -d.half_width)
    assert isclose(-d.half_width+b*d.ridge_height+c*d.lean, -d.half_width+d.lean)
    assert tarp.screen_limits(d, d.front_z)[0] == 0
    cubes = tarp.screen(d, tent.face)
    assert len(tarp.build(d, tent.face)['cubes']) < 460
    cloth = [cube for cube in cubes if cube['uv']['east'] == tent.face('tarp_under')]
    seams = [cube for cube in cubes if cube['uv']['east'] == tent.face('seam')]
    assert 68 < len(cloth) < 130
    assert len(seams) > 68
    for cube in cubes:
        assert cube['rotation'][0:2] == [0, 0]
        assert cube['rotation'][2] > 0
        assert cube['size'][2] <= d.tarp_column_depth+d.band_overlap+1e-9
        for x, y, z in tent.corners(cube):
            assert -d.half_width-1e-9 <= x < -35
            assert -1e-9 <= y <= d.ridge_height+1e-9
            assert d.tarp_front_z <= z <= d.front_z+d.lean+1e-9
            plane = -d.half_width+b*y+c*(z-d.front_z)
            assert abs(x-plane) < 1.2
        if cube in cloth:
            assert cube['uv']['west'] == tent.face('tarp_top')
        else:
            assert all(uv == tent.face('seam') for uv in cube['uv'].values())
    columns = sorted(set(cube['origin'][2] for cube in cloth))
    for left, right in zip(columns, columns[1:]):
        reach = min(right+d.band_overlap, tarp.body.ends(d, d.ridge_height)[0])
        assert any(cube['origin'][2] == left and cube['origin'][2]+cube['size'][2] >= reach-1e-9 for cube in cloth)`);
});

it("connects the tarp roof to the ridge without raising any surface above it", async () => {
  await run(`from math import isclose, sin, radians
d = dims.DIMS
tarp = load_tool('tent_tarp')
roof = tarp.roof(d, tent.face)
cloth = [cube for cube in roof if cube['uv']['down'] == tent.face('tarp_under')]
assert len(cloth) == 68
for cube in roof:
    assert all(size > 0 for size in cube['size'])
    assert cube['rotation'][1:] == [0, 0]
    assert cube['rotation'][0] > 0
    assert isclose(cube['size'][1], d.shell_thickness)
    for x, y, z in tent.corners(cube):
        assert -d.half_width <= x <= d.half_width
        assert d.tarp_front_z-1e-9 <= z <= d.front_z+d.lean+d.shell_thickness*abs(sin(radians(cube['rotation'][0])))+1e-9
        assert y <= d.ridge_height+1e-9
rear = tent.corners(cloth[-1])
assert isclose(max(p[1] for p in rear), d.ridge_height)
assert any(isclose(p[1], d.ridge_height) and isclose(p[2], d.front_z+d.lean) for p in rear)
assert isclose(min(p[0] for p in rear), -d.half_width+d.lean)
assert isclose(max(p[0] for p in rear), d.half_width-d.lean)
for previous, following in zip(cloth, cloth[1:]):
    assert max(p[2] for p in tent.corners(previous)) > min(p[2] for p in tent.corners(following))`);
});

it("overlaps leaning body bands while keeping their top and ground corners contained", async () => {
  await run(`from math import isclose
d = dims.DIMS
body = load_tool('tent_body')
assert d.lean == 19.2 and d.band_height == 1
for builder, sides in ((body.side_band, (-1, 1)), (body.end_band, (True, False))):
    for side in sides:
        bands = [builder(d, tent.face, side, y, y+1, -20, 0) for y in range(d.ridge_height)]
        for band in bands:
            assert min(p[1] for p in tent.corners(band)) >= -1e-9
            assert max(p[1] for p in tent.corners(band)) <= d.ridge_height+1e-9
        for previous, following in zip(bands, bands[1:]):
            assert max(p[1] for p in tent.corners(previous)) > min(p[1] for p in tent.corners(following))
tent.validate(tent.assemble())`);
});
