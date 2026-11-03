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

it("keeps tapered screen bands and diagonal seams within their fabric and footprint", async () => {
  await run(`from dataclasses import replace
from math import isclose
tarp = load_tool('tent_tarp')
for height in (1, 2, 3, 4):
    for foot_x in (48, 50):
        for foot_depth in (12, 16, 20):
            d = replace(dims.DIMS, band_height=height, tarp_foot_x=foot_x, tarp_foot_depth=foot_depth)
            cubes = tarp.screen(d, tent.face)
            rows = [cubes[i:i+3] for i in range(0, len(cubes), 3)]
            previous_depth = 0
            previous_diagonal = d.tarp_front_z
            for cloth, diagonal, rear in rows:
                assert cloth['size'][2] > previous_depth
                previous_depth = cloth['size'][2]
                for seam in (diagonal, rear):
                    assert isclose(seam['size'][2], d.seam_width)
                    assert seam['origin'][2] >= cloth['origin'][2]
                    assert seam['origin'][2]+seam['size'][2] <= cloth['origin'][2]+cloth['size'][2]+1e-9
                    assert all(uv == tent.face('seam') for uv in seam['uv'].values())
                assert diagonal['origin'][2] > previous_diagonal
                previous_diagonal = diagonal['origin'][2]
                for cube in (cloth, diagonal, rear):
                    for x, y, z in tent.corners(cube):
                        assert d.tarp_foot_x-d.shell_thickness <= x <= d.half_width+1e-9
                        assert y >= -1e-9
                        assert d.tarp_front_z <= z <= d.front_z
                assert cloth['uv']['west'] == tent.face('tarp_under')
                assert all(uv == tent.face('tarp_top') for side, uv in cloth['uv'].items() if side != 'west')
            assert rows[0][0]['size'][2] == d.tarp_foot_depth
            assert rows[-1][0]['size'][2] == d.front_z-d.tarp_front_z
            assert rows[0][1]['origin'][2] == d.tarp_front_z+d.tarp_foot_depth/2`);
});
