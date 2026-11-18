import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = async <T>(setup: string, expression: string): Promise<T> =>
  JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('region_atlas')
from enum import Enum
class M(Enum):
    WOOD = 'wood'
    METAL = 'metal'
    SWATCHES_MIXED = 'mixed'
${setup}
print(json.dumps(${expression}))`),
  );

describe("region atlas", () => {
  it("searches wider layouts within a texture limit and permits an exact fit", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
for name in ('a', 'b', 'c'):
    r.register(m.Region(name, 12, 12, M.WOOD, lambda x,y: (0,0,0,255)))
a = m.pack(r, gutter_px=0, max_side=24)
single = m.RegionRegistry()
single.register(m.Region('edge', 24, 24, M.WOOD, lambda x,y: (0,0,0,255)))
b = m.pack(single, gutter_px=2, max_side=24)`,
        "[a.size, m.audit(a, m.render_atlas(a)), b.size, b.origin('edge')]",
      ),
    ).toEqual([[24, 24], [], [24, 24], [0, 0]]);
  });

  it("rejects impossible layouts and invalid texture limits", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
for name in ('a', 'b'):
    r.register(m.Region(name, 16, 16, M.WOOD, lambda x,y: (0,0,0,255)))
errors = []
for limit in (24, 15, 0, -1, 1.5, True):
    try: m.pack(r, max_side=limit)
    except ValueError as error: errors.append(str(error))`,
        "errors",
      ),
    ).toEqual([
      "Regions do not fit within a 24 by 24 atlas",
      "Regions do not fit within a 15 by 15 atlas",
      ...Array(4).fill("Maximum atlas side must be a positive texel count"),
    ]);
  });

  it("packs deterministically without rotation, overlaps or out-of-bounds regions", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 50 }),
            fc.integer({ min: 1, max: 50 }),
          ),
          { minLength: 1, maxLength: 12 },
        ),
        fc.integer({ min: 0, max: 4 }),
        async (sizes, gutter) => {
          const [size, origins, again, errors] = await run<
            [number[], number[][], number[][], string[]]
          >(
            `r = m.RegionRegistry()
for i, (w, h) in enumerate(${JSON.stringify(sizes)}):
    r.register(m.Region(str(i), w, h, M.WOOD, lambda x, y: (x, y, 17, 255)))
a = m.pack(r, ${gutter})
reverse = m.RegionRegistry()
for region in reversed(r.regions()): reverse.register(region)
b = m.pack(reverse, ${gutter})
assert a.size == b.size`,
            "[a.size, [a.origin(r.name) for r in r.regions()], [b.origin(r.name) for r in r.regions()], m.audit(b, m.render_atlas(b))]",
          );
          expect(origins).toEqual(again);
          expect(errors).toEqual([]);
          for (const [i, [x = -1, y = -1]] of origins.entries()) {
            const [w = 0, h = 0] = sizes[i] ?? [];
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x + w).toBeLessThanOrEqual(size[0] ?? 0);
            expect(y + h).toBeLessThanOrEqual(size[1] ?? 0);
            for (let j = 0; j < i; j++) {
              const [ox = 0, oy = 0] = origins[j] ?? [];
              const [ow = 0, oh = 0] = sizes[j] ?? [];
              expect(
                x + w + gutter <= ox ||
                  ox + ow + gutter <= x ||
                  y + h + gutter <= oy ||
                  oy + oh + gutter <= y,
              ).toBe(true);
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it("resolves fractional UVs into their region after packing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        async (w, h) => {
          expect(
            await run(
              `r = m.RegionRegistry()
r.register(m.Region('other', 20, 30, M.METAL, lambda x,y: (0,0,0,255)))
ref = r.register(m.Region('panel', ${w}, ${h}, M.WOOD, lambda x,y: (0,0,0,255)))
a = m.pack(r)
x,y = a.origin('panel')
u,v = ref.uv(${w}/2, ${h}/4)`,
              `[u-x, v-y, m.audit(a, m.render_atlas(a))]`,
            ),
          ).toEqual([w / 2, h / 4, []]);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("preserves the exact base rectangle and detects one changed byte", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
r.register(m.Region('base', 114, 220, M.SWATCHES_MIXED, lambda x,y: (x, y, 42, 255)))
a = m.pack(r)
pixels = bytearray(m.render_atlas(a))
clean = m.audit(a, pixels)
pixels[0] ^= 1`,
        "[a.size, a.origin('base'), clean, m.audit(a, pixels)]",
      ),
    ).toEqual([[114, 220], [0, 0], [], ["base: pixel mismatch at (0, 0)"]]);
  });

  it("audits UV boundaries and rejects duplicate names and invalid dimensions", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
ref = r.register(m.Region('panel', 4, 3, M.WOOD, lambda x,y: (0,0,0,255)))
errors = []
for call in [lambda: r.register(m.Region('panel', 1, 1, M.WOOD, lambda x,y: (0,0,0,0))), lambda: r.register(m.Region('bad', 0, 1, M.WOOD, lambda x,y: (0,0,0,0))), lambda: ref.uv(0,0), lambda: m.pack(r, -1)]:
    try: call()
    except ValueError: errors.append(True)
a = m.pack(r)
ref.uv(4,3)
ref.uv(-0.5,0)
ref.uv(float('nan'),0)`,
        "[len(errors), len(r.regions()), m.audit(a, m.render_atlas(a))]",
      ),
    ).toEqual([
      4,
      1,
      [
        "panel: UV outside region: (-0.5, 0)",
        "panel: UV outside region: (nan, 0)",
      ],
    ]);
  });
  it("audits live geometry faces, including mirrored UV sizes", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
ref = r.register(m.Region('panel', 4, 3, M.WOOD, lambda x,y: (0,0,0,255)))
a = m.pack(r)
face = {'uv': list(ref.uv(4,3)), 'uv_size': [-4,-3]}
a.bind_face('panel', face)
clean = m.audit(a, m.render_atlas(a))
face['uv_size'][0] = -5`,
        "[clean, m.audit(a, m.render_atlas(a))]",
      ),
    ).toEqual([[], ["panel: UV outside region: (-1, 0)"]]);
  });

  it("reports overlapping and out-of-bounds regions", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
for name in ('a','b'):
    r.register(m.Region(name, 2, 2, M.WOOD, lambda x,y: (0,0,0,255)))
a = m.Layout(r.regions(), (2,2), {'a': m.Placement(0,0), 'b': m.Placement(0,0)})
overlap = m.audit(a, m.render_atlas(a))
a.size = (1,1)
bounds = m.audit(a, bytes(4))`,
        "[overlap, [s for s in bounds if 'outside atlas' in s]]",
      ),
    ).toEqual([["b: overlaps a"], ["a: outside atlas", "b: outside atlas"]]);
  });
});

const dimension = fc.integer({ min: 1, max: 40 });
const coordinate = fc.integer({ min: -80, max: 80 });
const pyBool = (value: boolean) => (value ? "True" : "False");

it("maps corners and full rectangles through every placement orientation", async () => {
  await fc.assert(
    fc.asyncProperty(
      coordinate,
      coordinate,
      dimension,
      dimension,
      fc.boolean(),
      fc.boolean(),
      async (x, y, w, h, fx, fy) => {
        expect(
          await run(
            `p = m.Placement(${x}, ${y}, ${pyBool(fx)}, ${pyBool(fy)})
corners = [m.UvRect(u,v,0,0).to_atlas(p,${w},${h}) for u in (0,${w}) for v in (0,${h})]
r = m.UvRect(0,0,${w},${h}).to_atlas(p,${w},${h})`,
            "[[(r.u,r.v) for r in corners], [min(r.u,r.u+r.w), min(r.v,r.v+r.h), max(r.u,r.u+r.w), max(r.v,r.v+r.h)]]",
          ),
        ).toEqual([
          [
            [x + (fx ? w : 0), y + (fy ? h : 0)],
            [x + (fx ? w : 0), y + (fy ? 0 : h)],
            [x + (fx ? 0 : w), y + (fy ? h : 0)],
            [x + (fx ? 0 : w), y + (fy ? 0 : h)],
          ],
          [x, y, x + w, y + h],
        ]);
      },
    ),
    { numRuns: 20 },
  );
});

it("makes flips involutions for signed UV sizes and preserves translation", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(coordinate, coordinate, coordinate, coordinate),
      dimension,
      dimension,
      fc.boolean(),
      fc.boolean(),
      coordinate,
      coordinate,
      async ([u, v, w, h], width, height, fx, fy, x, y) => {
        expect(
          await run(
            `r = m.UvRect(${u}/4,${v}/4,${w}/4,${h}/4)
p = m.Placement(0,0,${pyBool(fx)},${pyBool(fy)})
a = r.to_atlas(p,${width},${height}).to_atlas(p,${width},${height})
b = r.to_atlas(m.Placement(${x},${y}),${width},${height})`,
            "[[a.u,a.v,a.w,a.h], [b.u,b.v,b.w,b.h]]",
          ),
        ).toEqual([
          [u / 4, v / 4, w / 4, h / 4],
          [x + u / 4, y + v / 4, w / 4, h / 4],
        ]);
      },
    ),
    { numRuns: 20 },
  );
});

it("renders and audits hand-built flipped placements and live faces", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.tuple(dimension, dimension, fc.boolean(), fc.boolean()), {
        minLength: 1,
        maxLength: 6,
      }),
      async (entries) => {
        expect(
          await run(
            `entries = json.loads('${JSON.stringify(entries)}')
registry = m.RegionRegistry()
placements = {}
y = 1
for i,(w,h,fx,fy) in enumerate(entries):
    name = str(i)
    registry.register(m.Region(name,w,h,M.WOOD,lambda u,v: (u,v,(u+v)%256,255)))
    placements[name] = m.Placement(2,y,fx,fy)
    y += h+2
layout = m.Layout(registry.regions(),(44,y),placements)
registry._layout = layout
expected = bytearray(44*y*4)
for region in layout.regions:
    p = layout.placement(region.name)
    rows = [[region.pixel(u,v) for u in range(region.width)] for v in range(region.height)]
    if p.flip_y: rows.reverse()
    for v,row in enumerate(rows):
        if p.flip_x: row.reverse()
        start = ((p.y+v)*44+p.x)*4
        expected[start:start+region.width*4] = bytes(channel for pixel in row for channel in pixel)
assert m.render_atlas(layout) == bytes(expected)
for region in layout.regions:
    p = layout.placement(region.name)
    face = {}
    m.UvRect(region.width,0,-region.width,region.height).to_atlas(p,region.width,region.height).apply(face)
    layout.bind_face(region.name,face)
    assert layout.face_region(dict(face)) == region.name
    ref = m.RegionRef(registry,region)
    assert ref.uv(0,0) == (m.UvRect(0,0,0,0).to_atlas(p,region.width,region.height).u,m.UvRect(0,0,0,0).to_atlas(p,region.width,region.height).v)`,
            "m.audit(layout,m.render_atlas(layout))",
          ),
        ).toEqual([]);
      },
    ),
    { numRuns: 20 },
  );
});

it("rejects flipped origins, packs without flips and catches incorrect orientation", async () => {
  expect(
    await run(
      `r = m.RegionRegistry()
r.register(m.Region('panel',4,3,M.WOOD,lambda u,v: (u,v,0,255)))
packed = m.pack(r)
assert not packed.placement('panel').flip_x and not packed.placement('panel').flip_y
right = m.Layout(r.regions(),(4,3),{'panel':m.Placement(0,0,True,False)})
wrong = m.Layout(r.regions(),(4,3),{'panel':m.Placement(0,0)})
rejected = False
try: right.origin('panel')
except ValueError: rejected = True`,
      "[rejected,m.audit(wrong,m.render_atlas(right))]",
    ),
  ).toEqual([true, ["panel: pixel mismatch at (0, 0)"]]);
});

it("validates neutral materials and preserves integer UV serialization", async () => {
  expect(
    await run(
      `registry = m.RegionRegistry()
errors = []
for material,pixel in [('wood',lambda u,v: (0,0,0,0)),(M.WOOD,None)]:
    try: registry.register(m.Region('bad',1,1,material,pixel))
    except ValueError as error: errors.append(str(error))
face = {'uv':[0,3],'uv_size':[4,-3]}
m.UvRect.of(face).to_atlas(m.Placement(2,5),4,3).apply(face)
assert all(type(n) is int for n in face['uv']+face['uv_size'])
wrapper = load_tool('camper_regions')
assert not any(hasattr(wrapper,name) for name in ('Region','Placement','UvRect','RegionFace','RegionRef','RegionRegistry','Layout','pack','render_atlas','audit'))`,
      "[errors,face]",
    ),
  ).toEqual([
    [
      "Regions require a material and pixel function",
      "Regions require a material and pixel function",
    ],
    { uv: [2, 8], uv_size: [4, -3] },
  ]);
});
