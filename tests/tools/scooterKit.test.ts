import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker({ hashSeed: 0 });
afterAll(() => python.close());
const setup = `import json, math, copy, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k=load_tool('scooter_kit')
a=load_tool('scooter_atlas')
d=load_tool('scooter_dims')
t=load_tool('cube_tilt')
`;
// The shared build peaked at 10.090 s in three loaded runs. Four times that rounds up to 41 s.
const GENERATOR_TIMEOUT_MS = 41_000;
const scalar = fc.double({ min: -20, max: 20, noNaN: true });
const angle = fc.double({ min: -170, max: 170, noNaN: true });

describe("scooter primitives", () => {
  it("contains planar quad corners on the outer face and extends inward", async () => {
    await fc.assert(
      fc.asyncProperty(
        angle,
        angle,
        angle,
        fc.double({ min: 0.2, max: 8, noNaN: true }),
        async (rx, ry, rz, width) => {
          await python.run(`${setup}
m=t.cube_matrix([${rx},${ry},${rz}])
center=[2,3,4]
normal=t.apply_matrix(m,[0,0,1])
inside=[center[i]-normal[i]*3 for i in range(3)]
points=[[center[i]+v for i,v in enumerate(t.apply_matrix(m,p))] for p in [[-${width},-2,0],[${width},-2,0],[-${width}*0.7,2,0],[${width}*0.8,2,0]]]
c=k.quad(*points,0.3,a.faces('paint'),inside,assembly='panel')
matrix=t.cube_matrix(c.get('rotation',[0,0,0]))
pivot=c.get('pivot',[0,0,0])
for p in points:
    local=[sum(matrix[i][j]*(p[i]-pivot[i]) for i in range(3))+pivot[j] for j in range(3)]
    assert abs(local[2]-(c['origin'][2]+c['size'][2]))<1e-6
    assert all(c['origin'][j]-1e-6<=local[j]<=c['origin'][j]+c['size'][j]+1e-6 for j in range(2))
for p in t.corners(c):
    assert sum((p[i]-center[i])*normal[i] for i in range(3))<1e-6
`);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("keeps yz and xz normals on one axis and requires compound assembly membership", async () => {
    await python.run(`${setup}
for rotation in ([27,0,0],[135,0,0],[-135,0,0],[0,38,0],[0,135,0],[0,0,0]):
    m=t.cube_matrix(rotation)
    pts=[t.apply_matrix(m,p) for p in [[-1,-1,0],[1,-1,0],[-1,1,0],[1,1,0]]]
    ins=t.apply_matrix(m,[0,0,-1])
    c=k.quad(*pts,0.2,a.faces('paint'),ins)
    assert t.axis_count(c)<=1
    assert all(abs(s-v)<1e-9 for s,v in zip(c['size'],[2,2,0.2]))
m=t.cube_matrix([25,35,0])
pts=[t.apply_matrix(m,p) for p in [[-1,-1,0],[1,-1,0],[-1,1,0],[1,1,0]]]
ins=t.apply_matrix(m,[0,0,-1])
try:
    k.quad(*pts,0.2,a.faces('paint'),ins)
    assert False
except ValueError as e:
    assert 'ADR 0167' in str(e)
c=k.quad(*pts,0.2,a.faces('paint'),ins,assembly='panel')
area=k.AreaCubes().add('body',c,assembly='panel')
merged=k.AreaCubes().merge(area)
assert merged.assemblies['panel'][0] is c
assert k.quad([0,0,0],[0,0,0],[0,1,0],[0,1,0],0.2,a.faces('paint'),[0,0,-1]) is None
for direction in ([0,1,0],[1e-8,1,1e-8],[0,-1,0]):
    rod,=k.tube([[0,0,0],direction],0.2,a.faces('chrome'),assembly='rod')
    axis=t.apply_matrix(t.cube_matrix(rod.get('rotation',[0,0,0])),[0,0,1])
    length=math.sqrt(sum(v*v for v in direction))
    assert max(abs(axis[i]-direction[i]/length) for i in range(3))<1e-9
`);
  });

  it("aligns tube segments and contains both endpoints", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(scalar, scalar, scalar),
        fc.tuple(scalar, scalar, scalar).filter((v) => Math.hypot(...v) > 0.1),
        async (start, delta) => {
          await python.run(`${setup}
p=${JSON.stringify(start)}
delta=${JSON.stringify(delta)}
q=[p[i]+delta[i] for i in range(3)]
c,=k.tube([p,q],0.4,a.faces('chrome'),assembly='rod')
m=t.cube_matrix(c.get('rotation',[0,0,0]))
pivot=c.get('pivot',[0,0,0])
n=t.apply_matrix(m,[0,0,1])
assert max(abs(n[i]-delta[i]/math.sqrt(sum(v*v for v in delta))) for i in range(3))<1e-9
for endpoint in [p,q]:
    local=[sum(m[i][j]*(endpoint[i]-pivot[i]) for i in range(3))+pivot[j] for j in range(3)]
    assert all(c['origin'][i]-1e-9<=local[i]<=c['origin'][i]+c['size'][i]+1e-9 for i in range(3))
`);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("mirrors rotated corners and keeps assembly objects live", async () => {
    await fc.assert(
      fc.asyncProperty(angle, angle, angle, scalar, async (rx, ry, rz, x) => {
        await python.run(`${setup}
c=k.box([${x},2,3],[${x}+2,5,7],a.faces('rubber'))
c.update(pivot=[1,2,3],rotation=[${rx},${ry},${rz}])
before=t.corners(c)
area=k.AreaCubes().add('body',c,assembly='test')
bones=[dict(name='body',pivot=[1,2,3],locators={'seat':[2,3,4]},cubes=area['body'])]
k.mirror_to_game(bones)
after=t.corners(c)
assert all(min(max(abs(p[i]-q[i]) for i in range(3)) for q in after)<=1e-6 for p in [[-v[0],v[1],v[2]] for v in before])
assert area.assemblies['test'][0] is c
assert bones[0]['locators']['seat']==[-2,3,4]
`);
      }),
      { numRuns: 40 },
    );
  });

  it("flips U on the four side faces and leaves the up and down faces alone", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 1, max: 20 }),
        async (u, du) => {
          await python.run(`${setup}
c=k.box([0,0,0],[1,1,1],a.faces('paint',${u},3,${du},5))
k.mirror_to_game([dict(name='body',pivot=[0,0,0],cubes=[c])])
for name in ('north','south','east','west'):
    assert c['uv'][name]['uv']==[${u}+${du},3] and c['uv'][name]['uv_size']==[-${du},5], name
for name in ('up','down'):
    assert c['uv'][name]['uv']==[${u},3] and c['uv'][name]['uv_size']==[${du},5], name
`);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("packs local faces inside their own regions and rejects a second resolution", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 16 }), async (extent) => {
        await python.run(`${setup}
c=k.box([0,0,0],[1,1,1],a.faces('paint',0,0,${extent},${extent}))
layout=a.pack_layout()
a.resolve([c],layout)
assert not a.audit(layout,a.render_atlas(layout))
for f in c['uv'].values():
    region=next(r for r in layout.regions if r.name==f.region)
    x,y=layout.origin(region.name)
    assert x<=f['uv'][0]<=f['uv'][0]+f['uv_size'][0]<=x+region.width<=layout.size[0]
    assert y<=f['uv'][1]<=f['uv'][1]+f['uv_size'][1]<=y+region.height<=layout.size[1]
try:
    a.resolve([c],layout)
    assert False
except ValueError:
    pass
for r in a.REGISTRY.regions():
    assert (r.material==a.Material.PAINT)==(r.name=='paint')
clear=next(r for r in a.REGISTRY.regions() if r.name=='clear')
assert all(clear.pixel(u,v)[3]==0 for v in range(clear.height) for u in range(clear.width))
`);
      }),
      { numRuns: 8 },
    );
  });

  it("cuts polygon plates, extrudes spans, and joins skins", async () => {
    await python.run(`${setup}
poly=[(0,0),(2,0),(0,2)]
w,h,pixel=a.outline_pixel(poly,4,lambda u,v:(1,2,3,255))
assert (w,h)==(8,8)
assert pixel(0,7)==(1,2,3,255) and pixel(7,0)[3]==0
plate=k.profile_plate(poly,1,0.2,'paint')
assert plate['uv']['east'].region=='paint' and plate['uv']['up'].region=='clear'
columns=k.extrude(poly,-1,1,0.5,a.faces('paint'))
assert len(columns)==4 and all(c['size'][0]==2 for c in columns)
rings=[[[0,0,0],[1,0,0],[1,1,0]],[[0,0,1],[1,0,1],[1,1,1]]]
assert len(k.skin(rings,0.1,a.faces('paint')))==2
assert len(k.skin(rings,0.1,a.faces('paint'),closed=True,assembly='skin'))==3
`);
  });

  it("rolls a tube cube about its own axis without leaving the segment direction", async () => {
    await python.run(`${setup}
d0=[0.941,0.188,0.282]
n=math.sqrt(sum(x*x for x in d0))
for roll in (0,45):
    c,=k.tube([[0,0,0],[x/n*3 for x in d0]],0.2,a.faces('chrome'),assembly='rod',roll=roll)
    axis=t.apply_matrix(t.cube_matrix(c.get('rotation',[0,0,0])),[0,0,1])
    assert all(abs(axis[i]-d0[i]/n)<1e-6 for i in range(3)),(roll,axis)
`);
  });

  it("uses the measured steering line, grounded tyres, and wheelbase", async () => {
    const result = JSON.parse(
      await python.run(`${setup}
assert d.AXLE_Y==d.TYRE_RADIUS
assert d.FRONT_AXLE_Z==-11.8 and d.REAR_AXLE_Z==11.8
assert d.REAR_AXLE_Z-d.FRONT_AXLE_Z==d.WHEELBASE
assert d.STEER_PIVOT==(0,d.HEADSET_Y,d.steering_axis_z(d.HEADSET_Y))
assert abs(math.degrees(math.atan2(d.STEER_PIVOT[2]-d.FRONT_AXLE_Z,d.HEADSET_Y-d.AXLE_Y))-20.9)<1e-9
print(json.dumps(d.i2m(425,537)))
`),
    );
    expect(result).toEqual([0, 0]);
  });
});

describe("generated scooter", () => {
  beforeAll(async () => {
    await python.run(`${setup}
import builtins
assert sys.flags.hash_randomization == 0
builtins.scooter_build = load_tool("gen_scooter").build()
`);
  }, GENERATOR_TIMEOUT_MS);

  const withBuild = (script: string) =>
    python.run(`${setup}
from pathlib import Path
from builtins import scooter_build as built
${script}
`);

  it("matches generated scooter geometry and atlas pixels with hash randomization disabled", async () => {
    await withBuild(`
rp = Path("packs/yasu_ride_rp")
source = Path(".cache/generated/scooter_source.geo.json")
assert built.source_geometry["minecraft:geometry"][0] == json.loads(source.read_text()), source
for name, part in (("scooter", built.fixed), ("scooter_paint", built.paint), ("scooter_lit", built.lit)):
    path = rp / "models/entity/yasu_ride" / (name + ".geo.json")
    assert part.geometry == json.loads(path.read_text()), path
decode = load_tool("render_preview").read_png_bytes
for name, part in (("scooter_fixed", built.fixed), ("scooter_paint", built.paint)):
    path = rp / "textures/entity/yasu_ride" / (name + ".png")
    assert decode(path) == (*part.layout.size, part.pixels), path
`);
  });

  it("partitions retained source faces and drops fully transparent faces from the alpha-tested passes", async () => {
    await withBuild(`
atlas = load_tool("region_atlas")
face_crop = load_tool("face_crop")
preview = load_tool("render_preview")
rp = Path("packs/yasu_ride_rp")
source = built.source_geometry["minecraft:geometry"][0]
full = built.full_geometry["minecraft:geometry"][0]
paint_regions = {r.name for r in built.paint.layout.regions}
pass_bones = []
source_images = []
shipped_images = []
shipped_count = 0
for texture, render_pass in (
    ("scooter_fixed", built.fixed),
    ("scooter_paint", built.paint),
):
    bones = render_pass.geometry["minecraft:geometry"][0]["bones"]
    pass_bones.append(bones)
    shipped_count += sum(len(cube["uv"]) for bone in bones for cube in bone["cubes"])
    source_images.append(atlas.AtlasImage(*render_pass.layout.size, render_pass.pixels))
    shipped_image = atlas.AtlasImage(*preview.read_png_bytes(rp / f"textures/entity/yasu_ride/{texture}.png"))
    assert (shipped_image.width, shipped_image.height) == render_pass.layout.size
    shipped_images.append(shipped_image)

def shape(cube):
    return {key: value for key, value in cube.items() if key != "uv"}

def rgba_rows(image, rect):
    for y in range(rect.y0, rect.y1):
        start = (y * image.width + rect.x0) * 4
        yield image.pixels[start:start + (rect.x1 - rect.x0) * 4]

source_count = clear_count = 0
visibility = {}
for original_bone, full_bone, fixed_bone, paint_bone in zip(
        source["bones"], full["bones"], *pass_bones, strict=True):
    for bone in (full_bone, fixed_bone, paint_bone):
        assert {k: v for k, v in bone.items() if k != "cubes"} == {
            k: v for k, v in original_bone.items() if k != "cubes"
        }
    cursors = (iter(fixed_bone["cubes"]), iter(paint_bone["cubes"]))
    full_cubes = iter(full_bone["cubes"])
    bone_name = original_bone["name"]
    lit = bone_name in ("headlights", "tail_lights") or bone_name.startswith("glow_")
    for original in original_bone["cubes"]:
        expected = ({}, {})
        for name, face in original["uv"].items():
            source_count += 1
            owner = int(face.region in paint_regions)
            if not lit:
                key = (owner, atlas.UvRect.of(face).texels())
                if key not in visibility:
                    visibility[key] = face_crop.is_visible(face, source_images[owner])
                if not visibility[key]:
                    clear_count += 1
                    continue
            expected[owner][name] = face
        retained = {name: face for name, face in original["uv"].items()
                    if name in expected[0] or name in expected[1]}
        if retained:
            rejoined = next(full_cubes)
            assert shape(rejoined) == shape(original)
            assert rejoined["uv"] == retained
            assert list(rejoined["uv"]) == list(retained)
        for owner, faces in enumerate(expected):
            if not faces:
                continue
            shipped = next(cursors[owner])
            assert shape(shipped) == shape(original)
            assert shipped["uv"] == faces
            assert list(shipped["uv"]) == list(faces)
            for name, shipped_face in shipped["uv"].items():
                source_rect = atlas.UvRect.of(faces[name]).texels()
                shipped_rect = atlas.UvRect.of(shipped_face).texels()
                assert all(before == after for before, after in zip(
                    rgba_rows(source_images[owner], source_rect),
                    rgba_rows(shipped_images[owner], shipped_rect), strict=True))
    assert all(next(cursor, None) is None for cursor in cursors)
    assert next(full_cubes, None) is None
assert clear_count > 0
assert source_count == clear_count + shipped_count
`);
  });

  it("rejoins the shipped faces with stacked atlas coordinates", async () => {
    await withBuild(`
shipped = built.full_geometry["minecraft:geometry"][0]
preview = load_tool("render_preview")
merged, texture = preview.load_scooter_model(Path("packs/yasu_ride_rp"), built)
paint_regions = {r.name for r in built.paint.layout.regions}
fixed_height = built.fixed.layout.size[1]
assert len(texture) == fixed_height + built.paint.layout.size[1]
assert len(texture[0]) == max(built.fixed.layout.size[0], built.paint.layout.size[0])
for shipped_bone, merged_bone in zip(shipped["bones"], merged["bones"], strict=True):
    assert {k: v for k, v in shipped_bone.items() if k != "cubes"} == {
        k: v for k, v in merged_bone.items() if k != "cubes"
    }
    for cube, rejoined in zip(shipped_bone["cubes"], merged_bone["cubes"], strict=True):
        assert {k: v for k, v in cube.items() if k != "uv"} == {
            k: v for k, v in rejoined.items() if k != "uv"
        }
        assert list(cube["uv"]) == list(rejoined["uv"])
        for name, face in cube["uv"].items():
            translated = dict(rejoined["uv"][name])
            u, v = translated["uv"]
            translated["uv"] = [u, v - (fixed_height if face.region in paint_regions else 0)]
            assert translated == face
`);
  });
});
