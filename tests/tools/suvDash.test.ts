import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("uses only dash regions and resin apart from the windshield rim latch", () => {
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
d = load_tool('suv_dash')
c = load_tool('suv_cubes')
atlas = load_tool('suv_atlas')
slab, fittings = d.dash_slab_cubes(), d.dash_fittings_cubes()
assert slab and fittings
latch = c.box(*d.LATCH_BOUNDS, 'rim')
c.translate([latch], 2, d.DASH_SHIFT_Z)
assert [cube for cube in slab + fittings if cube['uv'] == c.uv('rim')] == [latch]
for cube in slab + fittings:
    if cube == latch:
        continue
    for name, face in cube['uv'].items():
        if face == c.uv('resin')[name]:
            continue
        region = atlas.region_at(*face['uv'])
        assert region is not None and region[0] == 'dash', face
        _, spec, u, v = region
        w, h = face['uv_size']
        assert 0 < w <= spec.w - u and 0 < h <= spec.h - v, face`,
    ],
    { encoding: "utf8" },
  );
});
