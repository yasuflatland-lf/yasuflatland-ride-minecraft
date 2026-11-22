import fc from "fast-check";
import { afterAll, it } from "vitest";
import { FACE_SIDES } from "../support/modelFaces";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const run = (script: string) =>
  python.run(
    [
      "import sys",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "m = load_tool('face_sides')",
      script,
    ].join("\n"),
  );

it("matches the TypeScript face axes and signs in canonical order", async () => {
  await run(`import json
expected = json.loads('${JSON.stringify(FACE_SIDES)}')
assert [side.name for side in m.FACE_SIDES] == list(expected)
for side in m.FACE_SIDES:
    assert m.face_side(side.name) is side
    assert side.axis == expected[side.name]['axis']
    assert side.sign == expected[side.name]['sign']
    assert side.end == (1 if side.sign == 1 else 0)
    assert side.normal == tuple(side.sign if axis == side.axis else 0 for axis in range(3))

try: m.face_side('unknown')
except KeyError: pass
else: raise AssertionError('expected an unknown face to raise KeyError')

import dataclasses
try: m.FACE_SIDES[0].end = 1
except dataclasses.FrozenInstanceError: pass
else: raise AssertionError('expected the face side to be frozen')`);
});

const coordinate = fc.integer({ min: -1000, max: 1000 });
const extent = fc.integer({ min: 1, max: 1000 });

it("places quad corners on their face plane and spans both other axes", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(coordinate, coordinate, coordinate),
      fc.tuple(extent, extent, extent),
      async (lo, size) => {
        const hi = [lo[0] + size[0], lo[1] + size[1], lo[2] + size[2]];
        await run(`lo, hi = ${JSON.stringify(lo)}, ${JSON.stringify(hi)}
for side in m.FACE_SIDES:
    corners = m.quad(side, lo, hi)
    assert len(corners) == 4 and len(set(corners)) == 4
    assert all(point[side.axis] == (hi if side.end else lo)[side.axis] for point in corners)
    for axis in range(3):
        if axis != side.axis:
            assert {point[axis] for point in corners} == {lo[axis], hi[axis]}`);
      },
    ),
  );
});
