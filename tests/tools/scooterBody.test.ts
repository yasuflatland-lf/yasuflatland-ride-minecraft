import fc from "fast-check";
import { afterAll, describe, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import copy, math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
b=load_tool('scooter_body')
a=load_tool('scooter_atlas')
k=load_tool('scooter_kit')
t=load_tool('cube_tilt')
`;

describe("scooter body shell", () => {
  it("keeps the cowl surface symmetric and within the measured envelope", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 48.2, max: 320.8, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        async (station, section) => {
          await python.run(`${setup}
p=b._cowl_point(${station},${section},1)
q=b._cowl_point(${station},${section},-1)
assert p==[-q[0],q[1],q[2]]
photo=(${station},350)
restored=b._photo(b._surface(*photo,p[0]))
assert max(abs(a-c) for a,c in zip(photo,restored))<1e-9
assert 1.4<p[0]<5 and 4<p[1]<13 and 4<p[2]<19
`);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("keeps cutout panels convex so their masks cannot discard closure patches", async () => {
    await python.run(`${setup}
for cube,points,material in b._prepared()[0]:
    matrix=t.cube_matrix(cube.get('rotation',[0,0,0]))
    poly=[tuple(sum(matrix[i][j]*p[i] for i in range(3)) for j in range(2))
          for p in (points[0],points[1],points[3],points[2])]
    turns=[]
    for i,p in enumerate(poly):
        q,r=poly[(i+1)%4],poly[(i+2)%4]
        turns.append((q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]))
    assert min(turns)>=-1e-9 or max(turns)<=1e-9, (cube.assembly,points)
`);
  });

  it("registers before constructing faces and preserves packed layouts on repeat builds", async () => {
    await python.run(`${setup}
registry=a.RegionRegistry()
b.register_regions(registry)
registered=registry.regions()
b.register_regions(registry)
assert registry.regions()==registered
first=b.build()
a.pack_layout()
packed=a.REGISTRY._layout
second=b.build()
assert a.REGISTRY._layout is packed
assert first==second
assert all(x is not y for x,y in zip(first['body'],second['body']))
assert set(first)=={'body'}
assert len(first['body'])<=1200
assert all(c['size'][i]>0 for c in first['body'] for i in range(3))
for c in first['body']:
    for x,y,z in t.corners(c):
        assert abs(x)<5.2 and 4<y<18 and -8<z<19
`);
  });

  it("places all seven curved louvre rows on the rider's right before and after mirroring", async () => {
    await python.run(`${setup}
area=b.build()
slots=[c for c in area['body'] if any(f.region=='body_cowl_right' for f in c['uv'].values())]
assert slots
for c in slots:
    assert all(p[0]>0 for p in t.corners(c))
bones=[dict(name='body',pivot=[0,0,0],cubes=copy.deepcopy(slots))]
k.mirror_to_game(bones)
assert all(p[0]<0 for c in bones[0]['cubes'] for p in t.corners(c))
assert len(b.VENTS)==7
for xa,xb,y in b.VENTS:
    mid=(xa+xb)/2
    center=y+b.D.BODY_VENT_SLOPE/2+b.D.BODY_VENT_BOW
    assert b._is_vent(mid,center)
    assert not b._is_vent(mid,center+2*b.D.BODY_VENT_HALF_HEIGHT)
regions={r.name:r for r in a.REGISTRY.regions()}
for name,expected in [('body_cowl_right',True),('body_panels',False)]:
    region=regions[name]
    assert any(region.pixel(u,v)==(*b.D.BODY_SLOT_COLOR,255)
               for v in range(region.height) for u in range(region.width))==expected
painted=[(c,points) for c,points,material in b._prepared()[0]
         if c.assembly=='body_cowl' and material in ('paint','body_cowl_right')]
left=[points for _,points in painted if sum(p[0] for p in points)<0]
right=[points for _,points in painted if sum(p[0] for p in points)>0]
assert len(left)==len(right)
assert sorted(left)==sorted(tuple([-p[0],p[1],p[2]] for p in points) for points in right)
`);
  });
});
