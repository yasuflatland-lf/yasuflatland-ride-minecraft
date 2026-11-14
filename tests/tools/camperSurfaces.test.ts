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
      ["olive looped tweed", 192, 256, "fabric", true],
      ["olive khaki cream bolster", 128, 128, "fabric", true],
      ["olive welt", 32, 32, "fabric", true],
      ["green tweed and vinyl shared by both seats", 333, 128, "fabric", false],
      ["cab seat vinyl", 64, 64, "vinyl", true],
      ["cab seat vinyl swatches", 6, 1, "vinyl", true],
      ["flecked laminate", 192, 192, "lacquer", true],
      ["brushed stainless", 128, 64, "metal", true],
      ["range dial", 64, 64, "glass_coat", true],
      ["dark olive cab panel", 128, 64, "dark_lacquer", true],
      ["brown endgrain and pulls", 128, 128, "wood", true],
      ["carpet v3", 74, 222, "carpet", true],
      ["wall veneer", 416, 180, "wood", true],
      ["backsplash tile", 124, 152, "tile", true],
      ["table oak", 168, 144, "wood", true],
      ["light curtain fabric", 96, 120, "fabric", true],
      ["door wood", 111, 336, "wood", true],
      ["door marble", 101, 41, "stone", true],
      ["door kick", 101, 44, "metal", true],
      ["door cloth", 16, 104, "fabric", true],
      ["cab SPEED", 128, 128, "glass_coat", true],
      ["cab QUAD", 128, 128, "glass_coat", true],
      ["cab PAD", 184, 48, "vinyl", true],
      ["cab RADIO", 144, 40, "metal", true],
      ["cab SMALL", 128, 60, "glass_coat", true],
      ["cab DARK19", 1, 1, "dark_lacquer", true],
    ]);
  });
  it("preserves the reference material bytes regardless of sampling order", () => {
    expect(
      inspect(
        "{r.name: __import__('hashlib').sha256(bytes(c for y in range(r.height) for x in range(r.width) for c in r.pixel(x,y))).hexdigest() for r in k.REGISTRY.regions() if r.name != 'base'}",
        "for r in k.REGISTRY.regions():\n    if r.name != 'base':\n        for y in reversed(range(r.height)):\n            for x in reversed(range(r.width)): r.pixel(x,y)",
      ),
    ).toEqual({
      "olive looped tweed":
        "a10d8ab5b23bf605adf77c76080ea57bcb09bf12c108f3567a2b2f5749da9134",
      "olive khaki cream bolster":
        "66d5387e523d41891b6e8ff7a32ba10537216814135ab0962601a025bf8883cd",
      "olive welt":
        "c1d01e9182a899bcd7b3e1303f6c2599dacf3500586e338963fa5f3bf968ab79",
      "green tweed and vinyl shared by both seats":
        "1b90ae7fb5be0cdd714f8b5a2ab14cbf93aab8756ea0ddf4984d72bb8810d7ad",
      "cab seat vinyl":
        "1a915d6c9c52dbc538912ae2c93cba47b95d42d284838a49b9f7891f3b6ff139",
      "cab seat vinyl swatches":
        "a1d6e948b89f9e735a552197dfe05cbb4e85bf9beb856a24691594074ad77bd3",
      "flecked laminate":
        "85756420156afa783e0030423ad6c94f9af24f8b9e3316b8ac4619b5a3150092",
      "brushed stainless":
        "5a81bfbf1abd4be9ae99ca22b152031d70203078c92f8fa9fc1ece9bc2ecd884",
      "range dial":
        "139933046b8b791d142cc238bf1ebb53ef0a71b8ae737849f922889ee979a085",
      "dark olive cab panel":
        "c4a81371c2964af391421747c8df949291d31cdfcbf69224a0107a3858229eeb",
      "brown endgrain and pulls":
        "322dd7ee6075d479df5c89ae8f12c749b8748834c237109c69d496eb324eea1a",
      "door cloth":
        "874f821b45b315fb585c21e47656b35ac74beb24d2f3a80ed1cd53ce39cdad2a",
      "door kick":
        "dbba18ac8fed99e972418158536cd711498e6749637f245683546f7a4933be85",
      "door marble":
        "2ba5ca728e2df19a0c4450a4c0cb6a4cd017569be1303c6a3671ed2de139b8ca",
      "door wood":
        "ecfac6f54e242993150b23c77ccbce2d0bc111d681ac1ad4b2ceffabacecac5f",
      "light curtain fabric":
        "96cb2afdfd1af2a32a8c474d29772de73de329ad36815133ab1c4f825c3d559a",
      "carpet v3":
        "9991eee05af8091f0884c15915f20278d0d5ba41080c2c81a7650773bfad27cf",
      "wall veneer":
        "e00e655e7ae83b8c1957cf7290ca35c500796e167122406d0d2a49165359bd5a",
      "backsplash tile":
        "be8228bff5fc74423397efa64f21c3d95b1d6783e3edc0ab12aad087d2eb3750",
      "table oak":
        "3aec30b8a877063863d44ccd75a1286375e11161bbc0e3d4217581f7a2e5176a",
      "cab SPEED":
        "a17300945ab36ec52abe746fd3672eef13d9f08b4c40118bd53a03be272dc63a",
      "cab QUAD":
        "ee2c45e13b9a1705830628f72128202fd20a17eb5a312e62899004632eaac991",
      "cab PAD":
        "486ea611ed466a9e67d19d4954ed4a9051910c3d88b91e2ccfbb216a1f0805ca",
      "cab RADIO":
        "b37a7f7b5de638b9eb2b3aad71f43f80836cb8c0955c222854ace0d1a6926b55",
      "cab SMALL":
        "b6b77379755e6e2f974f4bb78f64a9a5f641c121b1fc28f2852664dfc56aeaad",
      "cab DARK19":
        "1a93b51f95cce226460cda2e9cb83e9943978987534d498b8f501178bc9cdf63",
    });
  });
  it("keeps non-rail veneer flat light tan and preserves rail and screw bytes", () => {
    const { base, colours, railHash, railRows } = inspect(
      "{'base': s.WALL_BASE, 'colours': sorted(colours), 'railHash': rail_hash, 'railRows': rail_rows}",
      `
from hashlib import sha256
width, height = s.WALL_SIZE
rail_rows = [row for row in range(height)
             if any(abs(s.WALL_TOP-(row+0.5)/s.WALL_SCALE-rail) < 0.5 for rail in s.WALL_RAILS)]
colours = {s.wall_pixel(x, row) for row in range(height) if row not in rail_rows for x in range(width)}
rail_hash = sha256(bytes(c for row in rail_rows for x in range(width) for c in s.wall_pixel(x, row))).hexdigest()
`,
    );
    expect(base).toEqual([196, 170, 128]);
    expect(colours).toEqual([[196, 170, 128, 255]]);
    expect(railRows).toEqual([44, 45, 46, 47, 100, 101, 102, 103]);
    // Captured from the original grained veneer before flattening its non-rail pixels.
    expect(railHash).toBe(
      "194ce457ce21b5ff395b457381ae1d2f72ecfcd2217836e6d075d704f13c4098",
    );
  });
  it("samples the veneer region on every large interior wall face", () => {
    const faces = inspect(
      "faces",
      `
faces = []
ox, oy = k.LAYOUT.origin('wall veneer')
for c in a['body']:
    if s.area_of(c) != 'walls': continue
    f = c['uv']['east' if c['origin'][0] < 0 else 'west']
    u0, v0 = f['uv'][0]-ox, f['uv'][1]-oy
    u1, v1 = u0+f['uv_size'][0], v0+f['uv_size'][1]
    lo_u, hi_u, lo_v, hi_v = u0, u1, v0, v1
    if c['size'][1]*c['size'][2] < 1500/16: continue
    assert all(n > 0 for n in f['uv_size']), (c['origin'], f)
    faces.append([lo_u, hi_u, lo_v, hi_v])
`,
    ) as [number, number, number, number][];
    expect(faces.length).toBeGreaterThanOrEqual(10);
    for (const [loU, hiU, loV, hiV] of faces) {
      expect(loU).toBeGreaterThanOrEqual(0.5);
      expect(hiU).toBeLessThanOrEqual(415.5);
      expect(loV).toBeGreaterThanOrEqual(0.5);
      expect(hiV).toBeLessThanOrEqual(179.5);
    }
  });
  it("exports positive, opaque veneer on both broad faces of the lining", () => {
    const faces = inspect(
      "faces",
      `
from pathlib import Path
texture = load_tool('render_preview').read_png(Path('packs/yasu_ride_rp/textures/entity/yasu_ride/camper.png'))
geometry = json.loads(Path('packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json').read_text())['minecraft:geometry'][0]
faces = []
for bone in geometry['bones']:
    if bone['name'] != 'body': continue
    for c in bone.get('cubes', []):
        x,y,z = c['origin']
        w,h,d = c['size']
        if abs(w-0.2)>1e-6 or not (abs(x+23)<1e-6 or abs(x-22.8)<1e-6): continue
        if h*d < 1500/16: continue
        # The four backsplash fragments intentionally use tile, not veneer.
        if x<0 and z>=24 and z+d<=39.5 and y>=30 and y+h<=49: continue
        for side in ('east', 'west'):
            f = c['uv'][side]
            u,v = f['uv']
            du,dv = f['uv_size']
            valid = du>1 and dv>1 and u>=0.5 and v>=0.5 and u+du<=415.50001 and v+dv<=179.50001
            samples = [texture[int(v+dv*j/16)][int(u+du*i/16)] for j in range(17) for i in range(17)] if valid else []
            faces.append([valid, all(p[3]==255 for p in samples)])
`,
    ) as [boolean, boolean][];
    expect(faces.length).toBeGreaterThanOrEqual(30);
    for (const [valid, opaque] of faces) {
      expect(valid).toBe(true);
      expect(opaque).toBe(true);
    }
  });
  it("keeps veneer on the backing of every tile fragment", () => {
    expect(
      inspect(`[
        [k.LAYOUT.face_region(c['uv']['east']),
         k.LAYOUT.face_region(c['uv']['west']),
         all(n > 0 for f in (c['uv']['east'], c['uv']['west']) for n in f['uv_size'])]
        for c in a['body'] if s.area_of(c) == 'tile']`),
    ).toEqual(
      Array.from({ length: 4 }, () => ["wall veneer", "backsplash tile", true]),
    );
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
          const column = origin[0] < 0 ? (56 - z) * 4 : (z + 48) * 4;
          expect(uv[0] + u * extent[0]).toBeCloseTo(
            0.5 + column * (415 / 416),
            8,
          );
          expect(uv[1] + v * extent[1]).toBeCloseTo(
            0.5 + (61 - y) * 4 * (179 / 180),
            8,
          );
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
  it("keeps veneer coordinates registered across all wall fragments", () => {
    expect(
      inspect(`all(
      abs(f['uv'][0]-k.LAYOUT.origin('wall veneer')[0] - (0.5 + ((56-c['origin'][2]-c['size'][2]) if c['origin'][0]<0 else (c['origin'][2]+48))*4*415/416))<1e-8
      and abs(f['uv'][1]-k.LAYOUT.origin('wall veneer')[1]-(0.5+(61-c['origin'][1]-c['size'][1])*4*179/180))<1e-8
      and all(abs(a-b)<1e-8 for a,b in zip(f['uv_size'],[c['size'][2]*4*415/416,c['size'][1]*4*179/180]))
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
