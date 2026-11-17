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

it("raises four hex nuts and a centre nut on each cap without entering the fork", async () => {
  await python.run(`${setup}
for side, axle, scale in (('front', -11.8, 1), ('rear', 11.8, 0.96)):
    hardware=[c for c in built['wheel_'+side] if c['uv']['east'].region=='chrome'
              and max(p[0] for p in t.corners(c))<=-1.429]
    assert hardware, 'Missing raised hub hardware'
    groups={}
    for c in hardware:
        pivot=c['pivot']
        key=tuple(round(v,6) for v in pivot[1:])
        groups.setdefault(key, []).append(c)
        for p in t.corners(c):
            assert -1.9<p[0]<=-1.429
            assert math.hypot(p[1]-4.3,p[2]-axle)<1.15*scale
    assert len(groups)==5, groups.keys()
    centres=list(groups)
    centre=min(centres,key=lambda p:math.hypot(p[0]-4.3,p[1]-axle))
    assert math.hypot(centre[0]-4.3,centre[1]-axle)<1e-5
    angles=sorted(math.atan2(p[1]-axle,p[0]-4.3)%(2*math.pi) for p in centres if p!=centre)
    for a,b in zip(angles,angles[1:]+[angles[0]+2*math.pi]):
        assert abs(b-a-math.pi/2)<1e-5
    for p,cs in groups.items():
        assert len({round(c['rotation'][0]%180,5) for c in cs})>=3
`);
});

it("adds staggered tread blocks and shoulders inside the original rolling envelope", async () => {
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
    assert len(rows)>=3
    crown=sorted(rows,key=abs)[:3]
    phases=[]
    for x in crown:
        phases.append(sorted(math.atan2(c['pivot'][2]-axle,c['pivot'][1]-4.3)%(2*math.pi) for c in rows[x]))
    assert any(abs(a[0]-phases[0][0])>0.01 for a in phases[1:])
`);
});

it("keeps raised front hardware opposite the fork, spring and link throughout wheel roll", async () => {
  await python.run(`${setup}
hardware=[c for c in built['wheel_front'] if c['uv']['east'].region=='chrome'
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
        assert min(sample(y+0.08*math.cos(a),z+0.08*math.sin(a)))>150
    assert sample(1.69,0)!=r.LUG_COLOR
`);
});
