import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { it } from "vitest";

it("paints bounded deterministic flake and readable relief for all sixteen paints", () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.nat({ max: 103 }), fc.nat({ max: 103 })), {
        minLength: 150,
        maxLength: 150,
      }),
      (samples) => {
        execFileSync(
          "python3",
          [
            "-I",
            "-c",
            `import sys, json
sys.path.insert(0, 'tools')
from tool_loader import load_tool
p = load_tool('suv_paint_body')
a = load_tool('suv_atlas')
m = load_tool('suv_material')
assert p.REGION_DENSITY == a.TEXELS_PER_PIXEL
samples = json.loads('${JSON.stringify(samples)}')
for paint in p.palette.BODY_PAINTS:
    for region in ('door_front', 'door_rear', 'hood_top', 'tailgate', 'hood_side', 'hood_lower', 'cargo'):
        assert all(c < b for c, b in zip(p.color(region, 0, 0, paint), paint.body))
        assert all(c > b for c, b in zip(p.color(region, 1, 1, paint), paint.body))
        assert p.relief(region, 0, 0) == p.GROOVE_RELIEF
    for u, v in samples:
        rgba = p.color('flake', u, v, paint)
        assert rgba[3] == 255
        assert all(abs(c - b) <= p.FLAKE_COLOR_JITTER for c, b in zip(rgba, paint.body))
        mer = p.mer('flake', u, v, paint)
        assert abs(mer.metalness - m.PAINT_METALNESS) <= p.FLAKE_METAL_JITTER
        assert abs(mer.roughness - m.PAINT_ROUGHNESS) <= p.FLAKE_ROUGH_JITTER
        assert mer.emissive == 0
        assert p.relief('flake', u, v) is None
        assert rgba == p.color('flake', u, v, paint)
        assert mer == p.mer('flake', u, v, paint)
        for spec in p.REGIONS:
            x, y = u % spec.w, v % spec.h
            color = p.color(spec.name, x, y, paint)
            value = p.mer(spec.name, x, y, paint)
            assert color[3] == 255 and value.emissive == 0
            if spec.base == 'body':
                assert abs(value.metalness - m.PAINT_METALNESS) <= p.FLAKE_METAL_JITTER
                assert abs(value.roughness - m.PAINT_ROUGHNESS) <= p.FLAKE_ROUGH_JITTER
                if p.detail(spec.name, x, y) is None:
                    assert all(abs(c - b) <= p.FLAKE_COLOR_JITTER for c, b in zip(color, paint.body))
            else:
                assert value.metalness == 0
                assert abs(value.roughness - m.HARDTOP_ROUGHNESS) <= p.HARDTOP_GRAIN
                assert color == p.color(spec.name, x, y, p.palette.BODY_PAINTS[0])
    for region in ('door_front', 'door_rear'):
        x, y, rx, ry = p.recess(region)
        assert p.detail(region, int(x), int(y)) == 'recess'
        assert p.relief(region, int(x), int(y)) == p.RECESS_RELIEF
        assert p.detail(region, int(x), int(y + ry * 0.6)) == 'recess_highlight'
d = p.dims
u = int((d.REAR_AXLE_Z - (d.REAR + 1)) * a.TEXELS_PER_PIXEL)
v = int((d.BELT_Y - d.ARCH_TOP_Y) * a.TEXELS_PER_PIXEL - 0.5)
assert p.detail('cargo', u, v) == 'groove'
assert p.detail('cargo', u, v - 1) == 'highlight'
assert p.relief('cargo', u, v) == p.GROOVE_RELIEF
# A fresh tool instance must produce the same pattern regardless of evaluation order.
import importlib.util
spec = importlib.util.spec_from_file_location('fresh_body', 'tools/suv_paint_body.py')
fresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fresh)
for u, v in reversed(samples):
    for paint in p.palette.BODY_PAINTS:
        assert p.color('flake', u, v, paint) == fresh.color('flake', u, v, paint)
        assert p.mer('flake', u, v, paint) == fresh.mer('flake', u, v, paint)
`,
          ],
          { encoding: "utf8" },
        );
      },
    ),
    { numRuns: 1 },
  );
});
