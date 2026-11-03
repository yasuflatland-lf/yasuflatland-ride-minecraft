import { execFileSync } from "node:child_process";
import { it } from "vitest";

// No painted region carries relief since the Rubicon body is built from plain swatches (ADR 0214), so both
// maps are flat everywhere; the normal map must still hold unit vectors.
it("keeps both relief variants flat and normal vectors normalized without atlas bleed", () => {
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
for y in range(a.ATLAS.height):
    for x in range(a.ATLAS.width):
        h, n = height(x, y), normal(x, y)
        assert h == (128, 128, 128, 255) and n == (128, 128, 255, 255), (x, y)
        vector = [c / 255 * 2 - 1 for c in n[:3]]
        assert abs(math.sqrt(sum(c*c for c in vector)) - 1) < 0.007
for block, painter in a.PAINTERS.items():
    for spec in painter.REGIONS:
        assert all(painter.relief(spec.name, u, v) is None for u in range(spec.w) for v in range(spec.h))
`,
  ]);
});
