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

it("raises three plain hex nuts at 120 degrees around a smaller stepped centre cap", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    cubes=built['wheel_'+side]
    faces=[c for c in cubes if c['uv']['east'].region=='running_nut']
    assert len(faces)==3
    centres=[(c['origin'][1]+c['size'][1]/2,c['origin'][2]+c['size'][2]/2) for c in faces]
    angles=sorted(math.atan2(z-axle,y-4.3)%(2*math.pi) for y,z in centres)
    for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]):
        assert abs(b-a-2*math.pi/3)<1e-5
    for y,z in centres:
        assert 0.9*scale<math.hypot(y-4.3,z-axle)<1.1*scale
    region=r.atlas.REGISTRY._regions['running_nut']
    opaque=[region.pixel(u,v)[:3] for u in range(region.width) for v in range(region.height) if region.pixel(u,v)[3]]
    assert len(set(opaque))==1, 'Nut faces must have no crossed chrome bands'
    assert region.pixel(0,0)[3]==0 and region.pixel(region.width//2,region.height//2)[3]==255
    caps=[c for c in cubes if c['uv']['east'].region=='running_centre']
    assert len(caps)==1 and max(caps[0]['size'][1:])<0.8*scale
    small=[c for c in cubes if c['uv']['east'].region=='running_centre_nut']
    assert len(small)==1 and max(small[0]['size'][1:])<0.45*scale
    assert small[0]['origin'][0]<caps[0]['origin'][0]
`);
});

it("uses dense shallow full-width tread inside a smooth original rolling envelope", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    blocks=[c for c in built['wheel_'+side] if c['uv']['east'].region=='rubber'
            and c['uv']['east']['uv_size']==[1,1]]
    rows={}
    for c in blocks:
        rows.setdefault(round(c['pivot'][0],4),[]).append(c)
        for p in t.corners(c):
            assert abs(p[0])<1.15
            assert math.hypot(p[1]-4.3,p[2]-axle)<=4.3*scale+1e-6
    assert len(rows)==5
    assert min(rows)<-0.8*scale and max(rows)>0.8*scale
    for cs in rows.values():
        angles=sorted(math.atan2(c['pivot'][2]-axle,c['pivot'][1]-4.3)%(2*math.pi) for c in cs)
        assert len(angles)>=64
        for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]):
            assert abs(b-a-2*math.pi/len(angles))<1e-5
    for x in sorted(rows,key=abs)[:3]:
        for c in rows[x]:
            assert c['size'][1]<=0.06*scale
            assert c['size'][2]<=0.37*scale
    assert r.RING_SEGMENTS>=64
    assert max(radius for x,radius in r.TYRE_PROFILE)>4.23
`);
});

it("keeps raised front hardware opposite the fork, spring and link throughout wheel roll", async () => {
  await python.run(`${setup}
hardware=[c for c in built['wheel_front'] if c['uv']['east'].region in ('chrome','rubber','running_nut','running_centre','running_centre_nut','running_polished','running_dish')
          and max(p[0] for p in t.corners(c))<=-1.429]
assert hardware
fork_low=min(p[0] for c in built['steer'] for p in t.corners(c))
assert fork_low>0
dish=[c for c in built['wheel_front'] if c['uv']['east'].region=='running_dish']
assert dish and all(max(p[0] for p in t.corners(c))<0 for c in dish), 'Raised dish must stay opposite the fixed suspension'
for step in range(72):
    matrix=t.cube_matrix([step*5,0,0])
    for c in hardware:
        for p in t.corners(c):
            q=t.apply_matrix(matrix,[p[0],p[1]-4.3,p[2]+11.8])
            assert q[0]<fork_low, 'Hardware intersects fixed suspension during roll'
`);
});

it("gives the dish geometric depth steps and a thin continuous polished bead on both faces", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    cubes=built['wheel_'+side]
    for sign in (-1,1):
        bead=[c for c in cubes if c['uv']['east'].region=='running_polished'
              and min(math.hypot(p[1]-4.3,p[2]-axle)/scale for p in t.corners(c))>2.7
              and sign*c['pivot'][0]>0]
        assert len(bead)>=128
        assert max(sign*p[0] for c in bead for p in t.corners(c))<1.27
        angles=sorted(set(round(math.atan2(c['pivot'][2]-axle,c['pivot'][1]-4.3)%(2*math.pi),5) for c in bead))
        assert max(b-a for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]))<0.11
    dish=[c for c in cubes if c['uv']['east'].region=='running_dish']
    points=[p for c in dish for p in t.corners(c)]
    assert min(p[0] for p in points)<-1.25 and max(p[0] for p in points)>-1.17
    radii=[math.hypot(p[1]-4.3,p[2]-axle)/scale for p in points]
    assert min(radii)<1.7 and max(radii)>2.1
    cap=[c for c in cubes if c['uv']['east'].region=='running_cap_'+side and c['origin'][0]<0]
    assert len(cap)==1 and cap[0]['origin'][0]<min(p[0] for p in points)-0.1
    region=r.atlas.REGISTRY._regions['running_cap_'+side]
    for i in range(72):
        a=2*math.pi*i/72
        for radius,opaque in ((0.94,True),(1.06,False)):
            u=round((1+radius*math.cos(a))*(region.width-1)/2)
            v=round((1+radius*math.sin(a))*(region.height-1)/2)
            if 0<=u<region.width and 0<=v<region.height:
                assert bool(region.pixel(u,v)[3])==opaque
`);
});

it("paints six small round rim screw heads evenly around the flange", async () => {
  await python.run(`${setup}
for side in ('front','rear'):
    pixel=r._wheel_pixel(r.CAP_RADIUS[side])
    def sample(y,z):
        return pixel(round((y+3.74)/7.48*256-0.5),round((z+3.74)/7.48*256-0.5))[:3]
    assert r.SCREW_COUNT==6 and r.SCREW_RADIUS<=0.14
    for i in range(6):
        a=2*math.pi*i/6
        y,z=r.SCREW_CIRCLE*math.cos(a),r.SCREW_CIRCLE*math.sin(a)
        assert min(sample(y,z))>=170, 'Round head must not have a dark slot'
        for j in range(12):
            b=2*math.pi*j/12
            assert min(sample(y+0.05*math.cos(b),z+0.05*math.sin(b)))>=170
            assert sample(y+0.19*math.cos(b),z+0.19*math.sin(b)) not in (r.CAP_COLOR,r.CAP_RIM_COLOR)
`);
});
