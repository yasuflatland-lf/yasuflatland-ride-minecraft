import fc from "fast-check";
import { afterAll, describe, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
s=load_tool('scooter_shield')
a=load_tool('scooter_atlas')
t=load_tool('cube_tilt')
`;

describe("scooter shield", () => {
  it("preserves the crown, symmetric fender and steadily flaring spine", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 188, max: 331, noNaN: true }),
        fc.double({ min: -4.3, max: 4.3, noNaN: true }),
        async (photoY, x) => {
          await python.run(`${setup}
y=s.D.i2m(0,${photoY})[1]
assert s._face_point(${x},y)==(-s._face_point(-${x},y)[0],*s._face_point(-${x},y)[1:])
assert s._smooth(s.SPINE,${photoY},2)<=s._smooth(s.SPINE,min(331,${photoY}+1),2)
assert s._shield_top(${x})<=s.D.SHIELD_TOP
for ring in s._fender_rings():
    for p,q in zip(ring,reversed(ring)):
        assert max(abs(v-w) for v,w in zip(p,(-q[0],q[1],q[2])))<1e-12
`);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("builds standalone, registers idempotently and authorizes every compound panel", async () => {
    await python.run(`${setup}
registry=a.RegionRegistry()
s.register_regions(registry)
registered=registry.regions()
s.register_regions(registry)
assert registry.regions()==registered
first=s.build()
a.pack_layout()
packed=a.REGISTRY._layout
second=s.build()
assert a.REGISTRY._layout is packed
assert first==second and first.assemblies==second.assemblies
assert set(first)=={'body','steer'}
cubes=[c for cs in first.values() for c in cs]
assert 0<len(cubes)<=s.D.SHIELD_BUDGET
assert all(x is not y for bone in first for x,y in zip(first[bone],second[bone]))
assert set(first.assemblies)=={'shield_face','shield_trim','shield_ridge','shield_fender'}
t.assert_axes(cubes,first.assemblies,{k:v for k,v in load_tool('gen_scooter').ASSEMBLIES.items() if k in first.assemblies})
for c in cubes:
    assert all(math.isfinite(v) for field in ('origin','size','rotation','pivot') for v in c.get(field,[]))
    assert all(v>0 for v in c['size'])
    assert t.axis_count(c)<=2
    assert t.axis_count(c)<=1 or any(c is member for cs in first.assemblies.values() for member in cs)
`);
  });

  it("keeps the alpha-cut horn at 0.8 scale and the fender, bolts and shadow on steer", async () => {
    await python.run(`${setup}
built=s.build()
horns=[c for c in built['body'] if any(f.region=='shield_horn' for f in c['uv'].values())]
assert len(horns)==1
horn=horns[0]
assert all(math.isclose(a,b) for a,b in zip(horn['size'],[s.D.SHIELD_HORN_DIAMETER*.8,s.D.SHIELD_HORN_DIAMETER*.8,s.D.SHIELD_HORN_DEPTH*.8]))
z,y=s.D.i2m(*s.HORN_POSITION)
assert horn['pivot']==[0,y,z+s.D.SHIELD_HORN_OFFSET]
assert horn['uv']['north'].region=='shield_horn'
assert horn['uv']['south'].region=='clear'
region=next(r for r in a.REGISTRY.regions() if r.name=='shield_horn')
pixels={region.pixel(u,v) for v in range(region.height) for u in range(region.width)}
assert a.CLEAR in pixels
assert (*s.D.SHIELD_HORN_FACE_COLOR,255) in pixels
assert (*s.D.SHIELD_HORN_SLOT_COLOR,255) in pixels
fender=built.assemblies['shield_fender']
assert fender and all(any(c is member for member in built['steer']) for c in fender)
bolts=[c for c in built['steer'] if all(f.region=='chrome' for f in c['uv'].values())]
assert len(bolts)==2
for bolt,(xi,yi) in zip(bolts,s.FENDER_BOLTS):
    z,y=s.D.i2m(xi,yi)
    assert bolt['origin']==[s._fender_width(xi)-s.D.SHIELD_BOLT_INSET,y-s.D.SHIELD_BOLT_HALF_SIZE,z-s.D.SHIELD_BOLT_HALF_SIZE]
assert sum(any(f.region=='shield_crown' for f in c['uv'].values()) for c in built['steer'])==1
crown=next(r for r in a.REGISTRY.regions() if r.name=='shield_crown')
assert all(any(crown.pixel(u,v)[3] for v in range(crown.height)) for u in range(crown.width))
for bone,cube,points,material in s._prepared()[0]:
    assert any(s._panel_pixels(cube,points,material)[3::4])
`);
  });
});
