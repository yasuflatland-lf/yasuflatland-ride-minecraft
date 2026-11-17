import { afterAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
r=load_tool('scooter_running')
d=load_tool('scooter_dims')
t=load_tool('cube_tilt')
built=r.build()
`;

it("raises five hex nuts and a dark centre boss on each cap without entering the fork", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    hardware=[c for c in built['wheel_'+side] if c['uv']['east'].region in ('chrome','rubber')
              and max(p[0] for p in t.corners(c))<=-1.429]
    assert hardware, 'Missing raised hub hardware'
    groups={}
    nuts=[c for c in hardware if abs(c['pivot'][0]+1.43)<1e-6]
    for c in nuts:
        pivot=c['pivot']
        key=tuple(round(v,6) for v in pivot[1:])
        groups.setdefault(key, []).append(c)
        for p in t.corners(c):
            assert -1.95<p[0]<=-1.429
            assert math.hypot(p[1]-4.3,p[2]-axle)<1.5*scale
    assert len(groups)==6, groups.keys()
    centres=list(groups)
    centre=min(centres,key=lambda p:math.hypot(p[0]-4.3,p[1]-axle))
    assert math.hypot(centre[0]-4.3,centre[1]-axle)<1e-5
    angles=sorted(math.atan2(p[1]-axle,p[0]-4.3)%(2*math.pi) for p in centres if p!=centre)
    for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]):
        assert abs(b-a-2*math.pi/5)<1e-5
    radii=[math.hypot(p[0]-4.3,p[1]-axle) for p in centres if p!=centre]
    assert max(radii)-min(radii)<1e-5
    assert all(0.9*scale<radius<1.1*scale for radius in radii)
    assert any(c["uv"]["east"].region=="rubber" for c in groups[centre])
    for p,cs in groups.items():
        assert len({round(c['rotation'][0]%180,5) for c in cs})>=3
        if p!=centre:
            assert all(c["size"][0]>=0.3*scale and c["size"][1]>=0.58*scale for c in cs)
`);
});

it("adds regular full-width tread blocks and shoulders inside the original rolling envelope", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    blocks=[c for c in built['wheel_'+side] if c['uv']['east'].region=='rubber'
            and c['uv']['east']['uv_size']==[1,1]]
    assert len(blocks)>=120, 'Missing block tread'
    rows={}
    for c in blocks:
        x=c['pivot'][0]
        rows.setdefault(round(x,4),[]).append(c)
        for p in t.corners(c):
            assert abs(p[0])<1.15
            assert math.hypot(p[1]-4.3,p[2]-axle)<=4.3*scale+1e-6
    carcass=[c for c in built['wheel_'+side] if c['uv']['east'].region=='rubber'
             and c['uv']['east']['uv_size']!=[1,1] and min(p[0] for p in t.corners(c))>-1.2]
    assert carcass
    assert max(math.hypot(p[1]-4.3,p[2]-axle) for c in carcass for p in t.corners(c))<4.15*scale
    assert len(rows)==5
    assert min(rows)<-0.8*scale and max(rows)>0.8*scale
    crown=sorted(rows)
    phases=[]
    for x in crown:
        phases.append(sorted(math.atan2(c['pivot'][2]-axle,c['pivot'][1]-4.3)%(2*math.pi) for c in rows[x]))
    for phase in phases:
        assert len(phase)==40
        for a,b in zip(phase,phase[1:]+[phase[0]+2*math.pi]):
            assert abs(b-a-2*math.pi/40)<1e-5
    for phase in phases[1:]:
        assert all(abs(a-b)<1e-5 for a,b in zip(phase,phases[0]))
    for x in sorted(rows,key=abs)[:3]:
        for c in rows[x]:
            top=max(math.hypot(p[1]-4.3,p[2]-axle) for p in t.corners(c))
            assert top>4.28*scale
            assert c['size'][2]<2*4.1*scale*math.sin(math.pi/40)
            assert c['size'][1]>=0.18*scale
`);
});

it("keeps raised front hardware opposite the fork, spring and link throughout wheel roll", async () => {
  await python.run(`${setup}
hardware=[c for c in built['wheel_front'] if c['uv']['east'].region in ('chrome','rubber')
          and max(p[0] for p in t.corners(c))<=-1.429]
assert hardware
fork_low=min(p[0] for c in built['steer'] for p in t.corners(c))
assert fork_low>0
for step in range(72):
    matrix=t.cube_matrix([step*5,0,0])
    for c in hardware:
        for p in t.corners(c):
            q=t.apply_matrix(matrix,[p[0],p[1]-4.3,p[2]+11.8])
            assert q[0]<fork_low, 'Hardware intersects fixed suspension during roll'
`);
});

it("surrounds the dark boss with a round ring and raises the outer bead on both faces", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    ring=[]
    bead={-1:[],1:[]}
    for c in built['wheel_'+side]:
        if c['uv']['east'].region!='chrome':
            continue
        points=t.corners(c)
        radii=[math.hypot(p[1]-4.3,p[2]-axle)/scale for p in points]
        if max(p[0] for p in points)<-1.6 and min(radii)>0.3 and max(radii)<0.5:
            ring.append(c)
        if min(radii)>2.7 and max(radii)<3.1:
            for sign in (-1,1):
                if max(sign*p[0] for p in points)>1.25:
                    bead[sign].append(c)
    assert len(ring)>=32, 'Centre boss needs a continuous round chrome rim'
    angles=sorted(math.atan2(c['pivot'][2]-axle,c['pivot'][1]-4.3)%(2*math.pi) for c in ring)
    assert max(b-a for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]))<0.2
    assert all(len(cubes)>=64 for cubes in bead.values()), 'Missing raised bead lip'
    cap=[c for c in built['wheel_'+side] if c['uv']['east'].region=='running_cap_'+side]
    assert len(cap)==2
    region=r.atlas.REGISTRY._regions['running_cap_'+side]
    for i in range(72):
        a=2*math.pi*i/72
        for radius,opaque in ((0.88,True),(1.12,False)):
            u=round((1+radius*math.cos(a))*(region.width-1)/2)
            v=round((1+radius*math.sin(a))*(region.height-1)/2)
            if 0<=u<region.width and 0<=v<region.height:
                assert bool(region.pixel(u,v)[3])==opaque, 'Dish outline is not round'
`);
});

it("paints six slotted rim screws without the old five lug dots", async () => {
  await python.run(`${setup}
for side in ('front','rear'):
    pixel=r._wheel_pixel(r.CAP_RADIUS[side])
    def sample(y,z):
        return pixel(round((y+3.74)/7.48*256-0.5),round((z+3.74)/7.48*256-0.5))[:3]
    for i in range(6):
        a=2*math.pi*i/6
        y,z=2.48*math.cos(a),2.48*math.sin(a)
        assert max(sample(y,z))<120, 'Missing screw slot'
        assert sample(y+0.16*math.cos(a),z+0.16*math.sin(a))==r.CAP_COLOR
    assert sample(1.69,0)!=r.LUG_COLOR
`);
});
