import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import json, math, copy, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k=load_tool('scooter_kit')
a=load_tool('scooter_atlas')
d=load_tool('scooter_dims')
t=load_tool('cube_tilt')
`;
// Two full builds of every merged area run slowly under parallel CI load.
const GENERATOR_TIMEOUT_MS = 120_000;
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

  it(
    "builds identical geometry and atlas bytes twice",
    async () => {
      await python.run(`${setup}
g=load_tool('gen_scooter')
first,second=g.build(),g.build()
assert json.dumps(first.full_geometry)==json.dumps(second.full_geometry)
for before,after in zip(first[1:],second[1:],strict=True):
    assert json.dumps(before.geometry)==json.dumps(after.geometry)
    assert before.layout.size==after.layout.size and before.pixels==after.pixels
    assert len(before.layout._faces)==len(after.layout._faces)
`);
    },
    GENERATOR_TIMEOUT_MS,
  );
});
