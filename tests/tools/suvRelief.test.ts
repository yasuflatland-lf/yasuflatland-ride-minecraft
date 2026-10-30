import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("keeps both relief variants flat away from detail and normal vectors normalized without atlas bleed", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
a = load_tool('suv_atlas')
m = load_tool('suv_material')
height = m.relief_pixel('heightmap')
normal = m.relief_pixel('normal')
flat_count = slope_count = 0
for y in range(a.ATLAS.height):
    for x in range(a.ATLAS.width):
        h, n = height(x, y), normal(x, y)
        assert h[0] == h[1] == h[2] and h[3] == n[3] == 255
        hit = a.region_at(x, y)
        if hit is None or a.ATLAS.swatch_at(x, y) is not None:
            assert h == (128, 128, 128, 255) and n == (128, 128, 255, 255)
        else:
            block, spec, u, v = hit
            r = a.region(block, spec.name)
            neighbors = [(max(0, u-1), v), (min(spec.w-1, u+1), v),
                         (u, max(0, v-1)), (u, min(spec.h-1, v+1)), (u, v)]
            if all(a.PAINTERS[block].relief(spec.name, nu, nv) is None for nu, nv in neighbors):
                assert n == (128, 128, 255, 255)
                flat_count += 1
        vector = [c / 255 * 2 - 1 for c in n[:3]]
        assert abs(math.sqrt(sum(c*c for c in vector)) - 1) < 0.007
        assert n[2] >= 128
        slope_count += n != (128, 128, 255, 255)
assert flat_count > 0 and slope_count > 0
r = a.region('body', 'hood_top')
# At the upper edge, the slope uses the groove itself rather than the preceding atlas region.
assert normal(r.x + r.w // 2, r.y)[1] < 128
assert normal(r.x + r.w // 2, r.y + r.h - 1)[1] > 128
assert normal(r.x, r.y + r.h // 2)[0] < 128
assert normal(r.x + r.w - 1, r.y + r.h // 2)[0] > 128
assert height(r.x, r.y) == (64, 64, 64, 255)
r = a.region('body', 'door_front')
u, v, _, _ = a.PAINTERS['body'].recess('door_front')
assert height(r.x + int(u), r.y + int(v)) == (96, 96, 96, 255)
`,
  ]);
});
