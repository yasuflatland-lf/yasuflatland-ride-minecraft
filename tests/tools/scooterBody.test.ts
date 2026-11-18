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

  it("uses rounded narrow rails around visibly recessed rubber channels", async () => {
    await python.run(`${setup}
f=load_tool('scooter_floor')
d=f.D.FLOOR_STRIPS
cubes=f.build()['body']
assert 0.15<=d['chrome_lip_width']<=0.25
assert d['chrome_lip_width']<=d['rubber_width']<=2*d['chrome_lip_width']
assert d['groove_depth']>=0.15
for side in (-1,1):
    for x,front,rear in zip(d['x_centres'],d['front_z'],d['rear_z']):
        core=next(c for c in cubes if c['uv']['up'].region=='body_tread'
                  and math.isclose(c['origin'][0]+c['size'][0]/2,side*x))
        assert math.isclose(core['size'][0],d['rubber_width'])
        assert math.isclose(core['origin'][2],front)
        assert math.isclose(core['origin'][2]+core['size'][2],rear)
        assert core['origin'][1]>=f.D.BODY_DECK_Y
        for direction in (-1,1):
            cx=side*x+direction*(d['rubber_width']+d['chrome_lip_width'])/2
            rail=[c for c in cubes if c['uv']['up'].region=='body_rail'
                  and math.isclose(c['origin'][0]+c['size'][0]/2,cx)
                  and math.isclose(c['origin'][2],front)
                  and math.isclose(c['size'][2],rear-front)]
            assert len(rail)>=3
            widest=max(rail,key=lambda c:c['size'][0])
            highest=max(rail,key=lambda c:c['origin'][1]+c['size'][1])
            assert highest['size'][0]<widest['size'][0]
            assert highest['size'][1]>widest['size'][1]
            assert math.isclose(highest['origin'][1]+highest['size'][1]
                                -core['origin'][1]-core['size'][1],d['groove_depth'])
            for end,sign in ((front,-1),(rear,1)):
                caps=[c for c in cubes if c['uv']['up'].region=='body_rail'
                      and math.isclose(c['origin'][0]+c['size'][0]/2,cx)
                      and 0<sign*(c['origin'][2]+c['size'][2]/2-end)<d['cap_length']]
                assert len(caps)>=6, 'Every rail needs rounded caps at both ends'
                near=min(caps,key=lambda c:abs(c['origin'][2]+c['size'][2]/2-end))
                far=max(caps,key=lambda c:abs(c['origin'][2]+c['size'][2]/2-end))
                assert far['size'][0]<near['size'][0]
`);
  });

  it("keeps narrow paint gaps, staggered lengths and floor bounds in the dimension table", async () => {
    await python.run(`${setup}
f=load_tool('scooter_floor')
d=f.D.FLOOR_STRIPS
assert d['count']==len(d['x_centres'])==len(d['front_z'])==len(d['rear_z'])==3
width=d['rubber_width']+2*d['chrome_lip_width']
centres=d['x_centres']
assert centres[0]-width/2>1.06
assert centres[-1]+width/2<d['edge_x']-d['edge_size']/2
for left,right in zip(centres,centres[1:]):
    assert 0<right-left-width<0.15
for i in range(d['count']-1):
    assert d['front_z'][i]>d['front_z'][i+1]+2*d['cap_length']
    assert d['rear_z'][i]<d['rear_z'][i+1]-2*d['cap_length']
for c in f.build()['body']:
    for px,py,pz in t.corners(c):
        assert abs(px)<4.6 and 4.3<py<7.8 and -6.5<pz<5.0
`);
  });

  it("attaches the centre stand below the deck without chrome protrusions", async () => {
    await python.run(`${setup}
s=load_tool('scooter_stand')
points=[p for c in s.build()['stand'] for p in t.corners(c)]
assert max(p[1] for p in points)<=b.D.BODY_DECK_Y-0.04
assert max(p[1] for p in points)>=b.D.BODY_DECK_Y-0.15
`);
  });

  it("leaves all three deck rails outside the lower centre tunnel", async () => {
    await python.run(`${setup}
points=[p for _,quad,_ in b._geometry()[0] for p in quad
        if -2.4<p[2]<0.1 and 5.5<p[1]<5.7]
assert points
assert all(abs(p[0])<1.06 for p in points), 'The tunnel must clear the inner chrome lip'
`);
  });

  it("backs the raised front curl and rear step with paint and uses unbanded edge chrome", async () => {
    await python.run(`${setup}
f=load_tool('scooter_floor')
area=f.build()['body']
paint=[p for c in area if c['uv']['up'].region=='paint' for p in t.corners(c)]
for side in (-1,1):
    assert any(side*x>3.8 and y>5.65 and z<-5.0 for x,y,z in paint)
    assert any(side*x>3.8 and y>5.6 and z>4.5 for x,y,z in paint)
edge=[c for c in area if c['uv']['up'].region=='body_edge']
assert edge
region=next(r for r in a.REGISTRY.regions() if r.name=='body_edge')
assert len({region.pixel(u,v) for u in range(region.width) for v in range(region.height)})==1
assert any(c['size'][2]>2 for c in edge)
`);
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
