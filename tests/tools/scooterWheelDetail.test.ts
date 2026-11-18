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

it("raises four bevelled hex nuts over washers around a two-step centre cap", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    cubes=built['wheel_'+side]
    faces=[c for c in cubes if c['uv']['east'].region=='running_nut']
    assert len(faces)==4
    centres=[(c['origin'][1]+c['size'][1]/2,c['origin'][2]+c['size'][2]/2) for c in faces]
    angles=sorted(math.atan2(z-axle,y-4.3)%(2*math.pi) for y,z in centres)
    for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]):
        assert abs(b-a-math.pi/2)<1e-5
    for y,z in centres:
        assert 0.75*scale<math.hypot(y-4.3,z-axle)<0.85*scale
    assert all(abs(math.cos(a))>0.6 and abs(math.sin(a))>0.6 for a in angles)
    assert r.NUT_DEPTH>=0.3
    washers=[c for c in cubes if c["uv"]["east"].region=="running_nut_washer"]
    assert len(washers)==4
    for nut,washer in zip(faces,washers):
        assert washer["size"][1]>nut["size"][1]
        assert nut["origin"][0]<washer["origin"][0]
    region=r.atlas.REGISTRY._regions['running_nut']
    opaque=[region.pixel(u,v)[:3] for u in range(region.width) for v in range(region.height) if region.pixel(u,v)[3]]
    assert set(opaque)=={r.NUT_BORDER_COLOR,r.CAP_COLOR}
    assert region.pixel(region.width//2,region.height//2)[:3]==r.CAP_COLOR
    for u in range(region.width):
        colors=[region.pixel(u,v)[:3] for v in range(region.height) if region.pixel(u,v)[3]]
        if colors:
            assert colors[0]==r.NUT_BORDER_COLOR and colors[-1]==r.NUT_BORDER_COLOR
    assert region.pixel(0,0)[3]==0 and region.pixel(region.width//2,region.height//2)[3]==255
    caps=[c for c in cubes if c['uv']['east'].region=='running_centre']
    assert len(caps)==1 and 0.8*scale<max(caps[0]['size'][1:])<0.9*scale
    bosses=[c for c in cubes if c['uv']['east'].region=='running_centre_boss']
    assert len(bosses)==1 and max(bosses[0]['size'][1:])>=1.09*scale
    assert caps[0]['origin'][0]<bosses[0]['origin'][0]
    small=[c for c in cubes if c['uv']['east'].region=='running_centre_nut']
    assert len(small)==1 and 0.59*scale<=max(small[0]['size'][1:])<=0.61*scale
    assert small[0]['origin'][0]<caps[0]['origin'][0]
`);
});

it("keeps a smooth tyre without tread blocks, reaching the rolling radius", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    assert not [c for c in built['wheel_'+side] if c['uv']['east'].region=='rubber'
                and c['uv']['east']['uv_size']==[1,1]]
    for c in [c for c in built['wheel_'+side] if c['uv']['east'].region=='rubber']:
        for p in t.corners(c):
            assert abs(p[0])<1.15
            assert math.hypot(p[1]-4.3,p[2]-axle)<=4.3*scale+1e-6
assert r.RING_SEGMENTS>=64
assert max(radius for x,radius in r.TYRE_PROFILE)<=4.3
assert min(radius for x,radius in r.TYRE_PROFILE)>=3.4
`);
});

it("keeps raised front hardware opposite the fork, spring and link throughout wheel roll", async () => {
  await python.run(`${setup}
raised_regions=('running_nut','running_nut_washer','running_centre','running_centre_nut','running_centre_boss')
hardware=[c for c in built['wheel_front'] if c['uv']['east'].region in raised_regions]
assert all(max(p[0] for p in t.corners(c))<=-1.429 for c in hardware)
hardware += [c for c in built['wheel_front'] if c['uv']['east'].region=='running_dish'
             or (c['uv']['east'].region=='running_polished' and c['pivot'][0]<0)]
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

it("gives the exposed dish a boss, recess and rolled lip beside a wide polished bead", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    cubes=built['wheel_'+side]
    for sign in (-1,):
        bead=[c for c in cubes if c['uv']['east'].region=='running_polished'
              and min(math.hypot(p[1]-4.3,p[2]-axle)/scale for p in t.corners(c))>2.6
              and sign*c['pivot'][0]>0]
        assert len(bead)>=128
        assert max(sign*p[0] for c in bead for p in t.corners(c))<1.31
        angles=sorted(set(round(math.atan2(c['pivot'][2]-axle,c['pivot'][1]-4.3)%(2*math.pi),5) for c in bead))
        assert max(b-a for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]))<0.11
    dish=[c for c in cubes if c['uv']['east'].region=='running_dish']
    points=[p for c in dish for p in t.corners(c)]
    assert min(p[0] for p in points)<-1.38 and max(p[0] for p in points)>-1.19
    assert len(r.DISH_PROFILE)>=5 and len(r.DISH_LIP_PROFILE)>=3
    assert r.DISH_LIP_PROFILE[1][0]>r.DISH_PROFILE[1][0]<r.DISH_PROFILE[-1][0]
    assert r.DISH_PROFILE[0][1]<r.SCREW_CIRCLE-r.SCREW_RADIUS
    assert r.DISH_LIP_PROFILE[-1][1]>r.SCREW_CIRCLE+r.SCREW_RADIUS
    assert r.LINE_INNER-r.BEAD_INNER>=0.2
    assert max(radius for x,radius in r.BEAD_PROFILE)-min(radius for x,radius in r.BEAD_PROFILE)>=0.2
    radii=[math.hypot(p[1]-4.3,p[2]-axle)/scale for p in points]
    assert min(radii)<1.4 and max(radii)>2.6
    cap=[c for c in cubes if c['uv']['east'].region=='running_cap_'+side and c['origin'][0]<0]
    assert len(cap)==1 and cap[0]['origin'][0]<min(p[0] for p in points)
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

it("paints six larger dark slotted screws on a distinct rim ring", async () => {
  await python.run(`${setup}
for side in ('front','rear'):
    pixel=r._wheel_pixel(r.CAP_RADIUS[side])
    def sample(y,z):
        return pixel(round((y+3.74)/7.48*256-0.5),round((z+3.74)/7.48*256-0.5))[:3]
    assert 5<=r.SCREW_COUNT<=6 and 0.18<=r.SCREW_RADIUS<=0.2
    for i in range(r.SCREW_COUNT):
        a=2*math.pi*i/r.SCREW_COUNT
        y,z=r.SCREW_CIRCLE*math.cos(a),r.SCREW_CIRCLE*math.sin(a)
        assert sample(y,z)==r.LINE_COLOR
        for tangent in (-0.09,0.09):
            assert sample(y-tangent*math.sin(a),z+tangent*math.cos(a))==r.SCREW_COLOR
        assert sample(y+0.23*math.cos(a),z+0.23*math.sin(a))!=r.SCREW_COLOR
    assert sample(r.SCREW_CIRCLE*math.cos(0.3),r.SCREW_CIRCLE*math.sin(0.3))==r.RIM_PAINT_COLOR
`);
});
