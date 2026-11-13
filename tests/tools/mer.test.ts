import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const run = async (body: string) =>
  (
    await python.run(`
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('mer')
${body}
`)
  ).trim();

it("validates channels and preserves them in RGBA", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(...Array(3).fill(fc.integer({ min: 0, max: 255 }))),
      async (values) => {
        expect(
          JSON.parse(
            await run(
              `import json\nprint(json.dumps(m.Mer(${values.join(",")}).rgba()))`,
            ),
          ),
        ).toEqual([...values, 255]);
      },
    ),
    { numRuns: 10 },
  );
  await fc.assert(
    fc.asyncProperty(
      fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 256 })),
      async (value) => {
        expect(
          await run(
            `try:\n m.Mer(${value}, 0, 0)\nexcept ValueError:\n print('rejected')`,
          ),
        ).toBe("rejected");
      },
    ),
    { numRuns: 10 },
  );
});

it("paints the lookup value or the supplied default", async () => {
  expect(
    JSON.parse(
      await run(
        `import json\np = m.mer_painter(lambda x, y: m.MER_LIT if x else None, m.Mer(1, 2, 3))\nprint(json.dumps([p(0, 0), p(1, 0)]))`,
      ),
    ),
  ).toEqual([
    [1, 2, 3, 255],
    [0, 255, 255, 255],
  ]);
});

it("relocates camper companion masks and non-emissive materials with the layout", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 25 }),
      fc.integer({ min: 1, max: 25 }),
      async (dx, dy) => {
        expect(
          await run(`
from pathlib import Path
r = load_tool('camper_regions')
k = load_tool('camper_kit')
assert Path('tools/camper_mer.py').exists(), 'Interior MER builder is missing'
c = load_tool('camper_mer')
l = load_tool('lit_textures')
expected = {'METAL': (255,0,60), 'LACQUER': (0,0,80), 'GLASS_COAT': (0,0,65), 'VINYL': (0,0,180), 'WOOD': (0,0,150), 'FABRIC': (0,0,245), 'CARPET': (0,0,250), 'TILE': (0,0,80), 'STONE': (0,0,85), 'DARK_LACQUER': (0,0,85)}
regions = [r.Region('base', k.ATLAS.width, k.ATLAS.height, r.Material.SWATCHES_MIXED, lambda x,y: (12,34,56,255))]
origins = {'base': (${dx}, ${dy})}
for i, name in enumerate(expected):
    regions.append(r.Region(name, 2, 3, r.Material[name], lambda x,y: (0,0,0,0)))
    origins[name] = (${dx} + k.ATLAS.width + 2 + i*3, ${dy})
layout = r.Layout(regions, (${dx}+k.ATLAS.width+35, ${dy}+k.ATLAS.height+2), origins)
data = c.build_interior_mer(layout)
assert len(data) == layout.size[0]*layout.size[1]*4
assert all(data[i] == 0 and data[i+2] == 255 for i in range(1,len(data),4))
def pixel(x,y):
    start = (y*layout.size[0]+x)*4
    return tuple(data[start:start+4])
for name, rgb in expected.items():
    x,y = origins[name]
    for v in range(3):
        for u in range(2): assert pixel(x+u,y+v) == (*rgb,255)
assert pixel(0,0) == (0,0,255,255)
for name in ('lens','marker_amber','marker_red','dome','glow'):
    assert pixel(${dx}+k.SLOTS.index(name),${dy}) == (0,0,255,255)
swatches = {'white': (0,0,85), 'panel': (0,0,90), 'ivory': (0,0,80), 'steel': (255,0,75), 'chrome': (255,0,50), 'slat': (255,0,80), 'aluminium': (255,0,80), 'dash': (0,0,185), 'dark_dash': (0,0,190), 'dash_pad': (0,0,175), 'wood': (0,0,155), 'wall_in': (0,0,160), 'gauge': (0,0,65), 'needle': (0,0,65), 'tweed': (0,0,245), 'tweed_line': (0,0,245), 'curtain': (0,0,245), 'piping': (0,0,235), 'khaki': (0,0,100), 'stripe': (0,0,100), 'tan': (0,0,100)}
for name,rgb in swatches.items(): assert pixel(${dx}+k.SLOTS.index(name),${dy}) == (*rgb,255)
for region in k.ATLAS.regions:
    rgb = (0,0,85) if region.name == 'rib' else (255,0,26) if region.name == 'mirror_chrome' else (255,0,75)
    for v in range(region.h):
        for u in range(region.w): assert pixel(${dx}+region.x+u,${dy}+region.y+v) == (*rgb,255)
class Capture:
    def __init__(self): self.images = {}
    def png(self,path,w,h,painter): self.images[path.name] = (w,h,painter)
    def json(self,*args): pass
out = Capture()
l.build_layout_lit_textures(out, Path('.'), 'camper', layout, lambda x,y: (12,34,56,255), 'base', lambda x,y: k.ATLAS.swatch_at(x,y) in k.LIT_SLOTS)
mask = m.layout_mask(layout, 'base', lambda x,y: k.MIRROR_CHROME_REGION.x <= x < k.MIRROR_CHROME_REGION.x+k.MIRROR_CHROME_REGION.w and k.MIRROR_CHROME_REGION.y <= y < k.MIRROR_CHROME_REGION.y+k.MIRROR_CHROME_REGION.h)
for y in range(layout.size[1]):
    for x in range(layout.size[0]):
        on = y == ${dy} and x-${dx} in k.LIT_SLOTS
        w,h,color = out.images['camper_lit.png']
        assert (w,h) == layout.size
        assert color(x,y) == (12,34,56,0 if on else 255)
        w,h,mer = out.images['camper_lit_mer.png']
        assert (w,h) == layout.size
        assert mer(x,y) == (0,255 if on else 0,255,255)
        tile = k.MIRROR_CHROME_REGION
        assert mask(x,y) == (${dx}+tile.x <= x < ${dx}+tile.x+16 and ${dy}+tile.y <= y < ${dy}+tile.y+32)
print('ok')
`),
        ).toBe("ok");
      },
    ),
    { numRuns: 8 },
  );
});
