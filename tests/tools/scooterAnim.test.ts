import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = (script: string) =>
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `
import math, json, sys, unittest
sys.path.insert(0, 'tools')
from tool_loader import load_tool
d=load_tool('scooter_dims')
t=load_tool('cube_tilt')
k=load_tool('scooter_kit')
a=load_tool('scooter_anim').build()['animations']
def anim(name): return a['animation.yasu_ride.scooter.'+name]
${script}
`,
    ],
    { encoding: "utf8" },
  );

const modelWorker = startPythonWorker();
afterAll(() => modelWorker.close());

const modelPython = (script: string) =>
  modelWorker.run(`
import math, json, sys, unittest
from functools import cache
sys.path.insert(0, 'tools')
from tool_loader import load_tool
d=load_tool('scooter_dims')
t=load_tool('cube_tilt')
g=load_tool('gen_scooter')
if not hasattr(g.build, 'cache_info'): g.build=cache(g.build)
${script}
`);

it("decomposes steering about the inclined axis with positive left steering", () => {
  python(`
class SteeringTests(unittest.TestCase):
    def test_axis_angle(self):
        axis=[0, math.cos(math.radians(d.STEERING_AXIS_DEGREES)), math.sin(math.radians(d.STEERING_AXIS_DEGREES))]
        def evaluate(expression, s):
            expression=expression.replace("query.property('yasu_ride:steer')", str(s))
            functions=dict(cos=lambda x:math.cos(math.radians(x)), sin=lambda x:math.sin(math.radians(x)),
                           asin=lambda x:math.degrees(math.asin(x)), atan2=lambda y,x:math.degrees(math.atan2(y,x)))
            from types import SimpleNamespace
            return eval(expression, {'math':SimpleNamespace(**functions)})
        for s in range(-80,81,5):
            with self.subTest(s=s):
                rotation=[evaluate(e,s) for e in anim('steer')['bones']['steer']['rotation']]
                matrix=t.cube_matrix(rotation)
                c, sn=math.cos(math.radians(-s)), math.sin(math.radians(-s))
                cross=[[0,-axis[2],axis[1]],[axis[2],0,0],[-axis[1],0,0]]
                expected=[[c*(i==j)+(1-c)*axis[i]*axis[j]+sn*cross[i][j] for j in range(3)] for i in range(3)]
                for i in range(3):
                    for j in range(3): self.assertAlmostEqual(matrix[i][j],expected[i][j],places=5)
                for distance in (-20,0,20):
                    point=[v*distance for v in axis]
                    moved=t.apply_matrix(matrix,point)
                    for x,y in zip(point,moved): self.assertAlmostEqual(x,y,places=4)
                front=t.apply_matrix(matrix,[0,0,-d.TYRE_RADIUS])
                if s>0: self.assertGreater(front[0],0)
                axle=[0,d.AXLE_Y-d.STEER_PIVOT[1],d.FRONT_AXLE_Z-d.STEER_PIVOT[2]]
                for x,y in zip(t.apply_matrix(matrix,axle),axle): self.assertAlmostEqual(x,y,places=4)
assert unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(SteeringTests)).wasSuccessful()
`);
});

it("retains the wheel fold drop, clears fixed geometry and raises the stand feet", async () => {
  await modelPython(`
g=load_tool('gen_scooter')
geo=g.build().full_geometry
bones={b['name']:b for b in geo['minecraft:geometry'][0]['bones']}
low=min(p[1] for name in ('body','steer','headlights','tail_lights') for c in bones[name]['cubes'] for p in t.corners(c))
threshold=max(d.AXLE_Y-p[0]-low for name in ('wheel_front','wheel_rear') for c in bones[name]['cubes'] for p in t.corners(c))
assert threshold<d.FOLD_DROP
assert d.FOLD_DROP==3.5
assert d.FOLD_DROP*4==round(d.FOLD_DROP*4)
pivot=d.STAND_PIVOT
assert pivot==(0,d.i2m(*d.STAND_PIXEL)[1],d.i2m(*d.STAND_PIXEL)[0]-d.STAND_PIVOT_BACK)
feet=[c for c in bones['stand']['cubes'] if c['origin'][1]==0]
assert len(feet)==2
for cube in feet:
    for p in t.corners(cube):
        q=t.apply_matrix(t.cube_matrix([d.STAND_UP_DEGREES,0,0]),[p[i]-pivot[i] for i in range(3)])
        assert q[1]+pivot[1]>1 and q[2]+pivot[2]<p[2]
assert sum(len(b['cubes']) for b in bones.values())<=d.CUBE_BUDGET
`);
}, 90_000);

it("centres single-axis glow squares at the axles with radius-sized corners and lower-face locators", async () => {
  await modelPython(`
glow=load_tool('scooter_glow').build()
running=load_tool('scooter_running').build()
assert not glow.assemblies
atlas=load_tool('scooter_atlas')
region=next(r for r in atlas.REGISTRY.regions() if r.name=='glow')
assert region.material==atlas.Material.LENS
for x in range(region.width):
    for y in range(region.height): assert region.pixel(x,y)==(80,170,255,255)
geo=load_tool('gen_scooter').build().full_geometry
bones={b['name']:b for b in geo['minecraft:geometry'][0]['bones']}
for side,z in (('front',d.FRONT_AXLE_Z),('rear',d.REAR_AXLE_Z)):
    cubes=glow['glow_'+side]
    assert len(cubes)==d.GLOW_SEGMENTS
    outer=min(p[0] for c in running['wheel_'+side] for p in t.corners(c))
    for c in cubes:
        assert c.get('rotation',[0,0,0])[1:]==[0,0]
        assert abs(c['origin'][0]+c['size'][0]-(outer-d.GLOW_GAP))<1e-6
        assert abs(c['size'][0]-d.GLOW_DEPTH)<1e-9
        for p in t.corners(c): assert abs(math.hypot(p[1]-d.AXLE_Y,p[2]-z)-d.TYRE_RADIUS)<1e-6
        assert all(face.region=='glow' for face in c['uv'].values())
    bone=bones['glow_'+side]
    assert bone['parent']=='wheel_'+side+'_fold'
    locator=bone['locators']['hover_'+side]
    assert abs(locator[0]-(-outer+d.GLOW_GAP+d.GLOW_DEPTH))<.001
    assert locator[1:]==[d.AXLE_Y,z]
    assert locator[0]>0
`);
});

it("generates reversible staged folds, wheel travel, lean, particles and per-clip engine sounds", () => {
  python(`
from pathlib import Path
output=load_tool('scooter_anim').build()
assert json.loads(Path('packs/yasu_ride_rp/animations/yasu_ride/scooter.anim.json').read_text())==output
assert output['format_version']=='1.8.0'
assert len(a)==25
start=str(d.FOLD_LAY_START)
reverse=str(round(1-d.FOLD_LAY_START,6))
for bone in ('wheel_front_fold','wheel_rear_fold'):
    deploy=anim('wheels_deploy')['bones'][bone]
    retract=anim('wheels_retract')['bones'][bone]
    assert deploy['position']=={'0.0':[0,0,0],start:[0,-d.FOLD_DROP,0],'1.0':[0,-d.FOLD_DROP,0]}
    assert deploy['rotation']=={'0.0':[0,0,0],start:[0,0,0],'1.0':[0,0,d.FOLD_DEGREES]}
    for key in ('position','rotation'):
        assert retract[key]=={'0.0':deploy[key]['1.0'],reverse:deploy[key][start],'1.0':deploy[key]['0.0']}
        assert anim('wheels_folded')['bones'][bone][key]==deploy[key]['1.0']
assert anim('wheels_deploy')['sound_effects']=={'0.0':{'effect':'hover_start'}}
for name in ('wheels_deploy','wheels_retract'): assert anim(name)['animation_length']==d.FOLD_SECONDS
for bone in ('wheel_front','wheel_rear'):
    rotation=anim('wheels')['bones'][bone]['rotation']
    coefficient=float(rotation[0].split('*')[1])
    assert abs(coefficient-180/math.pi/(d.TYRE_RADIUS/16))<1e-6
    assert rotation[0].startswith('-query.modified_distance_moved') and rotation[1:]==[0,0]
assert anim('lean')['bones']['root']['rotation']==[0,0,"query.property('yasu_ride:lean') - query.property('yasu_ride:bank')"]
assert anim('stand_up')['bones']['stand']['rotation']==[d.STAND_UP_DEGREES,0,0]
assert anim('hover_glow')['animation_length']==d.GLOW_SECONDS
assert anim('hover_glow')['particle_effects']=={'0.0':[{'effect':'hover_glow','locator':'hover_front'},{'effect':'hover_glow','locator':'hover_rear'}]}
from pathlib import Path
suv=json.loads(Path('tools/templates/suv.anim.json').read_text())['animations']
sound=load_tool('scooter_sound')
assert isinstance(sound.ENGINE_CLIPS, tuple)
assert [clip.index for clip in sound.ENGINE_CLIPS]==list(range(6))
definitions=json.loads(Path('packs/yasu_ride_rp/sounds/sound_definitions.json').read_text())['sound_definitions']
for clip in sound.ENGINE_CLIPS:
    assert anim(f'engine_sound_{clip.index}')=={
        'loop':True, 'animation_length':clip.seconds,
        'sound_effects':{'0.0':{'effect':f'scooter_engine_{clip.index}'}}}
    assert sound.engine_effect(clip.index)==f'scooter_engine_{clip.index}'
    assert definitions[f'yasu_ride.scooter_engine_{clip.index}']['sounds'][0]['volume']==clip.volume
for i in range(5):
    name=f'hover_sound_{i}'
    assert anim(name)==suv['animation.yasu_ride.suv.'+name]
for name in ('wheels','steer','lean','stand_up','wheels_folded','hover_glow'): assert anim(name)['loop'] is True
`);
});

it("keeps the fold keys sorted, inside the clip and within the fold limits", () => {
  fc.assert(
    fc.property(fc.constantFrom("deploy", "folded", "retract"), (clip) => {
      const out = python(`
anim_mod=load_tool('scooter_anim')
def check(keys, limit):
    if isinstance(keys, dict):
        times=[float(k) for k in keys]
        assert times==sorted(times) and all(0<=x<=1 for x in times)
        values=list(keys.values())
    else:
        values=[keys]
    for v in values:
        assert all(abs(x)<=limit+1e-9 for x in v)
check(anim_mod.fold_position_keys('${clip}'), d.FOLD_DROP)
check(anim_mod.fold_rotation_keys('${clip}'), d.FOLD_DEGREES)
print('ok')
`);
      expect(out.trim()).toBe("ok");
    }),
    { numRuns: 3 },
  );
});

it("keeps the wheels_deploy position keys", () => {
  const out = python(`
anim_mod=load_tool('scooter_anim')
print(json.dumps(list(anim_mod.fold_position_keys('deploy'))))
`);
  expect(JSON.parse(out)).toEqual(["0.0", "0.4", "1.0"]);
});

it("moves each strut with its fold position keys without rotating it", () => {
  python(`
module=load_tool('scooter_anim')
for clip in ('deploy','folded','retract'):
    bones=anim('wheels_'+clip)['bones']
    for side,strut in d.STRUT_BONES.items():
        assert bones[strut]=={'position':module.fold_position_keys(clip)}
        assert bones[strut]['position']==bones[d.FOLD_BONES[side]]['position']
`);
});

it("generates six evenly spaced exhaust loops with increasing puff rates", () => {
  python(`
rates=d.EXHAUST_PUFFS_PER_SECOND
assert isinstance(rates, tuple) and len(rates)==6
assert all(isinstance(rate, int) and rate>0 for rate in rates)
assert all(low<high for low,high in zip(rates,rates[1:]))
assert len([name for name in a if name.startswith('animation.yasu_ride.scooter.exhaust_')])==6
for i,rate in enumerate(rates):
    clip=anim(f'exhaust_{i}')
    assert clip['loop'] is True and clip['animation_length']==1.0
    keys=clip['particle_effects']
    times=[float(key) for key in keys]
    assert len(times)==rate and times==sorted(times)
    assert times[0]==0 and times[-1]<1
    gaps=[b-a for a,b in zip(times,times[1:]+[1.0])]
    assert all(abs(gap-1/rate)<0.000002 for gap in gaps)
    assert all(effect=={'effect':'exhaust_smoke','locator':'exhaust'} for effect in keys.values())
`);
});
