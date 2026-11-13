import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defined } from "../support/defined";

function inspect(expression: string, setup = "") {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k = load_tool('camper_kit')
s = load_tool('camper_surfaces')
a = s.build_surfaces(k.REGISTRY)
${setup}
print(json.dumps(${expression}))
`,
      ],
      { encoding: "utf8" },
    ),
  );
}

describe("camper interior surfaces", { timeout: 30_000 }, () => {
  it("builds against an independent registry with relocated base swatches", () => {
    expect(
      inspect(
        "[sorted(v.name for v in r.regions()), k.regions.audit(r._layout,k.regions.render_atlas(r._layout)), a['body'][0]['uv']['north']['uv'] == [r._layout.origin('base')[0]+k.SLOTS.index('wood'),r._layout.origin('base')[1]]]",
        `
r = k.regions.RegionRegistry()
r.register(k.regions.Region('other', 512, 128, k.regions.Material.WOOD, lambda x,y: (0,0,0,255)))
a = s.build_surfaces(r)
`,
      ),
    ).toEqual([
      [
        "backsplash tile",
        "base",
        "carpet v3",
        "other",
        "table oak",
        "wall veneer",
      ],
      [],
      true,
    ]);
  });
  it("registers opaque materials at their native texture resolution", () => {
    expect(
      inspect(
        "[[r.name,r.width,r.height,r.material.value,all(r.pixel(x,y)[3] == 255 for y in range(r.height) for x in range(r.width))] for r in k.REGISTRY.regions() if r.name != 'base']",
      ),
    ).toEqual([
      ["carpet v3", 74, 222, "carpet", true],
      ["wall veneer", 416, 180, "wood", true],
      ["backsplash tile", 124, 152, "tile", true],
      ["table oak", 168, 144, "wood", true],
    ]);
  });
  it("preserves the reference material bytes regardless of sampling order", () => {
    expect(
      inspect(
        "{r.name: __import__('hashlib').sha256(bytes(c for y in range(r.height) for x in range(r.width) for c in r.pixel(x,y))).hexdigest() for r in k.REGISTRY.regions() if r.name != 'base'}",
        "for r in k.REGISTRY.regions():\n    if r.name != 'base':\n        for y in reversed(range(r.height)):\n            for x in reversed(range(r.width)): r.pixel(x,y)",
      ),
    ).toEqual({
      "carpet v3":
        "9991eee05af8091f0884c15915f20278d0d5ba41080c2c81a7650773bfad27cf",
      "wall veneer":
        "a92bf51eef145acf47014fcda8c5b88991e58ac7cb25e9f8ab9802ba65437330",
      "backsplash tile":
        "be8228bff5fc74423397efa64f21c3d95b1d6783e3edc0ab12aad087d2eb3750",
      "table oak":
        "3aec30b8a877063863d44ccd75a1286375e11161bbc0e3d4217581f7a2e5176a",
    });
  });
  it("samples the same veneer coordinates on either side of every fragment seam", () => {
    const walls = inspect(
      "[[c['origin'],c['size'],[f['uv'][0]-k.LAYOUT.origin('wall veneer')[0],f['uv'][1]-k.LAYOUT.origin('wall veneer')[1]],f['uv_size']] for c in a['body'] if s.area_of(c)=='walls' for f in [c['uv']['east' if c['origin'][0]<0 else 'west']]]",
    ) as [
      [number, number, number],
      [number, number, number],
      [number, number],
      [number, number],
    ][];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: walls.length - 1 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (i, u, v) => {
          const [origin, size, uv, extent] = defined(walls[i], "wall fragment");
          const z = origin[2] + (origin[0] < 0 ? 1 - u : u) * size[2];
          const y = origin[1] + (1 - v) * size[1];
          expect(uv[0] + u * extent[0]).toBeCloseTo((z + 48) * 4, 8);
          expect(uv[1] + v * extent[1]).toBeCloseTo((61 - y) * 4, 8);
        },
      ),
    );
  });
  it("keeps carpet lengthwise on the single real-base centre floor", () => {
    expect(
      inspect(
        "[[c['origin'],c['size'],c['uv']['up']['uv_size']] for c in a['body'] if s.area_of(c) == 'floor']",
      ),
    ).toEqual([
      [
        [-18.3, 13, -55],
        [36.6, 3, 111],
        [73.2, 222],
      ],
    ]);
  });
  it("keeps veneer grain vertical and registered across all wall fragments", () => {
    expect(
      inspect(`all(
      abs(f['uv'][0]-k.LAYOUT.origin('wall veneer')[0] - (c['origin'][2]+48+(c['size'][2] if c['origin'][0]<0 else 0))*4)<1e-8
      and abs(f['uv'][1]-k.LAYOUT.origin('wall veneer')[1]-(61-c['origin'][1]-c['size'][1])*4)<1e-8
      and all(abs(a-b)<1e-8 for a,b in zip(f['uv_size'],[c['size'][2]*4*(-1 if c['origin'][0]<0 else 1),c['size'][1]*4]))
      for c in a['body'] if s.area_of(c)=='walls'
      for f in [c['uv']['east' if c['origin'][0]<0 else 'west']])`),
    ).toBe(true);
    expect(
      inspect(
        "{name:sum(s.area_of(c)==name for c in a['body']) for name in ('floor','walls','tile','table')}",
      ),
    ).toEqual({ floor: 1, walls: 97, tile: 4, table: 2 });
  });
  it("splits tile to cover exactly the backsplash outside the counter window", () => {
    expect(
      inspect(
        "sorted([[c['origin'][1:],c['size'][1:]] for c in a['body'] if s.area_of(c)=='tile'])",
      ),
    ).toEqual([
      [
        [30, 24],
        [5, 15.5],
      ],
      [
        [35, 24],
        [0.4, 15.5],
      ],
      [
        [35.4, 24],
        [0.6, 15.5],
      ],
      [
        [36, 35],
        [13, 4.5],
      ],
    ]);
  });
  it("table leg is 1 x 1 px and preserves the 11 px height and decor top", () => {
    expect(
      inspect(
        "[[c['origin'],c['size']] for c in a['body'] if s.area_of(c)=='table']",
      ),
    ).toEqual([
      [
        [-23, 27, -6],
        [14, 1, 12],
      ],
      [
        [-14.5, 16, -0.5],
        [1, 11, 1],
      ],
    ]);
  });
  it("keeps every mapped face within its registered region", () => {
    expect(
      inspect("k.regions.audit(k.LAYOUT,k.regions.render_atlas(k.LAYOUT))"),
    ).toEqual([]);
  });
});
