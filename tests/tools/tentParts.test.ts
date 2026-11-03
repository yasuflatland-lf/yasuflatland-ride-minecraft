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
