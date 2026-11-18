import { statSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";
import {
  boneCubes,
  cubeBounds,
  loadScooterGeo,
} from "../tools/helpers/scooterGeo";
import { assertOneAxis, multipleAxes } from "./oneAxis";

type Cube = {
  origin: number[];
  size: number[];
  rotation?: number[];
  uv: Record<string, { uv: number[]; uv_size: number[] }>;
};
type AreaRow = {
  area: string;
  bones: readonly string[];
  assemblies: readonly string[];
};
// One row per area module (issues 6 to 11 each append one row).
// biome-ignore format: Keep independent area additions to a single line group.
const AREAS: readonly AreaRow[] = [
  { area: "running", bones: ["wheel_front", "wheel_rear", "steer", "body"], assemblies: ["running_wheel_front", "running_wheel_rear", "running_spring", "running_pedal"] },
  { area: "stand", bones: ["stand"], assemblies: ["running_stand"] },
  { area: "struts", bones: ["steer", "body", "wheel_front_strut", "wheel_rear_strut", "wheel_rear_stem"], assemblies: [] },
  { area: "body", bones: ["body"], assemblies: ["body_cowl", "body_tail", "body_frame", "body_floor"] },
  { area: "floor", bones: ["body"], assemblies: ["body_floor"] },
  { area: "rear", bones: ["body", "tail_lights"], assemblies: ["rear_seat", "rear_lamp", "rear_dome", "rear_cage", "rear_flange", "rear_plate"] },
  { area: "engine", bones: ["body"], assemblies: ["engine_casting", "engine_fan", "engine_kick", "engine_muffler", "engine_header"] },
  { area: "head", bones: ["steer", "headlights"], assemblies: ["head_collar", "head_headset", "head_bib", "head_meter", "head_lamp", "head_controls", "head_levers", "head_mirrors"] },
  { area: "shield", bones: ["body", "steer"], assemblies: ["shield_face", "shield_trim", "shield_ridge", "shield_fender"] },
  { area: "glow", bones: ["glow_front", "glow_rear"], assemblies: [] },
];

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
g=load_tool('gen_scooter')
d=load_tool('scooter_dims')
k=load_tool('scooter_kit')
`;
let metadata: {
  areas: string[];
  table: Record<string, { owner: string; cubes: number }>;
  assemblies: Record<string, Cube[]>;
  budget: number;
  ceiling: number;
  axis: number;
  allocation: Record<string, number>;
};
const geometry = loadScooterGeo();
const cubes = geometry.bones.flatMap((b) => b.cubes ?? []);

beforeAll(async () => {
  metadata = JSON.parse(
    await python.run(`${setup}
merged=k.AreaCubes()
for name in g.AREA_ORDER:
    merged.merge(load_tool('scooter_'+name).build())
layout=load_tool('scooter_atlas').pack_layout()
load_tool('scooter_atlas').resolve([c for cs in merged.values() for c in cs],layout)
bones=[dict(name=name,pivot=[0,0,0],cubes=cs) for name,cs in merged.items()]
k.mirror_to_game(bones)
print(json.dumps(g.rounded(dict(areas=g.AREA_ORDER,table=g.ASSEMBLIES,assemblies=merged.assemblies,budget=d.CUBE_BUDGET,ceiling=d.CUBE_BUDGET_CEILING,axis=d.STEERING_AXIS_DEGREES,allocation=d.AREA_CUBE_ALLOCATION))))
`),
  );
}, 30_000);

// Size of the generated geometry on main at the time of issue 1914.
const MAIN_GEOMETRY_BYTES = 1_390_072;

describe("scooter generated foundation", () => {
  it("keeps the generated geometry within twice the main baseline", () => {
    expect(
      statSync("packs/yasu_ride_rp/models/entity/yasu_ride/scooter.geo.json")
        .size,
    ).toBeLessThanOrEqual(2 * MAIN_GEOMETRY_BYTES);
  });

  it("derives the budget from all area allocations under the ceiling", () => {
    expect(Object.keys(metadata.allocation)).toEqual(metadata.areas);
    expect(Object.values(metadata.allocation).reduce((a, b) => a + b, 0)).toBe(
      metadata.budget,
    );
    expect(metadata.budget).toBe(5635);
    expect(metadata.ceiling).toBe(6000);
    expect(metadata.budget).toBeLessThanOrEqual(metadata.ceiling);
  });

  it("rejects an overallocated area and names it", async () => {
    await python.run(`${setup}
from unittest.mock import patch
for name in g.AREA_ORDER:
    with patch.dict(d.AREA_CUBE_ALLOCATION, {name: 0}):
        try:
            g.build()
        except ValueError as error:
            assert name in str(error), str(error)
        else:
            raise AssertionError('Accepted overallocated area: ' + name)
`);
  });

  it("rejects missing or extra allocation keys", async () => {
    await python.run(`${setup}
from unittest.mock import patch
for allocation in ({k:v for k,v in d.AREA_CUBE_ALLOCATION.items() if k != 'glow'}, {**d.AREA_CUBE_ALLOCATION, 'extra': 1}):
    with patch.object(d, 'AREA_CUBE_ALLOCATION', allocation):
        try:
            g.build()
        except ValueError:
            pass
        else:
            raise AssertionError('Accepted mismatched area keys')
`);
  });
  it("keeps block tops on the rolling circle with recessed grooves", async () => {
    const result: { side: string; low: number; high: number }[] = JSON.parse(
      await python.run(`${setup}
import math
r=load_tool('scooter_running')
t=load_tool('cube_tilt')
built=r.build()
assert r.RING_SEGMENTS>=64
out=[]
for side,axle,radius in (('front',-11.8,4.3),('rear',11.8,4.3*0.96)):
    bins=[0.0]*360
    for cube in built['wheel_'+side]:
        if cube['uv']['east'].region!='rubber':
            continue
        c=t.corners(cube)
        for i in range(8):
            for axis in range(3):
                j=i^(1<<axis)
                if i<j:
                    for step in range(41):
                        u=step/40
                        y=c[i][1]+u*(c[j][1]-c[i][1])-4.3
                        z=c[i][2]+u*(c[j][2]-c[i][2])-axle
                        b=int(math.degrees(math.atan2(z,y))%360)
                        bins[b]=max(bins[b],math.hypot(y,z))
    out.append(dict(side=side,low=min(bins)-radius,high=max(bins)-radius))
print(json.dumps(out))
`),
    );
    expect(result).toHaveLength(2);
    for (const { low, high } of result) {
      // Grooves recess the carcass while the block corners stay inside the rolling circle.
      expect(high).toBeLessThanOrEqual(0.001);
      expect(high).toBeGreaterThan(-0.01);
      expect(low).toBeGreaterThanOrEqual(-0.08);
    }
  });

  it("keeps black tyre panels behind the whitewall circle on both sides", async () => {
    await python.run(`${setup}
import itertools, math
r=load_tool('scooter_running')
t=load_tool('cube_tilt')
built=r.build()
for side,axle,scale in (('front',-11.8,1.0),('rear',11.8,0.96)):
    tyre=built['wheel_'+side][:r.RING_SEGMENTS*7]
    for sign in (-1,1):
        for cube in tyre:
            corners=t.corners(cube)
            points=[p for p in corners if sign*p[0]>=1.15]
            for i,p in enumerate(corners):
                for axis in range(3):
                    j=i^(1<<axis)
                    q=corners[j]
                    if i<j and (sign*p[0]-1.15)*(sign*q[0]-1.15)<0:
                        u=(sign*1.15-p[0])/(q[0]-p[0])
                        points.append([p[k]+u*(q[k]-p[k]) for k in range(3)])
            for p,q in itertools.combinations(points,2):
                y,z=p[1]-4.3,p[2]-axle
                dy,dz=q[1]-p[1],q[2]-p[2]
                u=max(0,min(1,-(y*dy+z*dz)/(dy*dy+dz*dz))) if dy*dy+dz*dz else 0
                assert math.hypot(y+u*dy,z+u*dz)>=3.71*scale-0.04
`);
  });

  it("keeps both whitewall boundaries within 0.04 units of concentric circles", async () => {
    const deviations: number[] = JSON.parse(
      await python.run(`${setup}
import math
r=load_tool('scooter_running')
a=load_tool('scooter_atlas')
deviations=[]
for side in ('front','rear'):
    region=a.REGISTRY._regions['running_disc_'+side]
    step=7.48/region.width
    # Flood only the outer white band; the bead and hub are separate pale regions.
    u=region.width//2
    v=next(v for v in range(region.height) if region.pixel(u,v)[3])
    pending=[(u,v)]
    wall=set(pending)
    while pending:
        u,v=pending.pop()
        for du,dv in ((1,0),(-1,0),(0,1),(0,-1)):
            q=(u+du,v+dv)
            if q in wall or not (0<=q[0]<region.width and 0<=q[1]<region.height):
                continue
            color=region.pixel(*q)
            if color[3] and min(color[:3])>=190:
                wall.add(q)
                pending.append(q)
    errors=[]
    for u,v in wall:
        for du,dv,corners in ((1,0,((1,0),(1,1))),(-1,0,((0,0),(0,1))),
                              (0,1,((0,1),(1,1))),(0,-1,((0,0),(1,0)))):
            if (u+du,v+dv) not in wall:
                for x,y in corners:
                    radius=math.hypot((u+x)*step-3.74,(v+y)*step-3.74)
                    errors.append(min(abs(radius-3.0),abs(radius-3.71)))
    deviations.append(max(errors))
print(json.dumps(deviations))
`),
    );
    expect(deviations).toHaveLength(2);
    for (const deviation of deviations) {
      expect(deviation).toBeLessThanOrEqual(0.04);
    }
  });

  it("keeps the exact ordered bone contract without rest rotations", () => {
    const steerZ =
      -11.8 + (17.9 - 4.3) * Math.tan((metadata.axis * Math.PI) / 180);
    const expected = [
      ["root", undefined, [0, 0, 0]],
      ["body", "root", [0, 0, 0]],
      ["steer", "root", [0, 17.9, steerZ]],
      ["wheel_front_fold", "steer", [0, 4.3, -11.8]],
      ["wheel_front", "wheel_front_fold", [0, 4.3, -11.8]],
      ["glow_front", "wheel_front_fold", [0, 4.3, -11.8]],
      ["wheel_front_strut", "steer", [0, 4.3, -11.8]],
      ["headlights", "steer", [0, 0, 0]],
      ["wheel_rear_fold", "body", [0, 4.3, 11.8]],
      ["wheel_rear", "wheel_rear_fold", [0, 4.3, 11.8]],
      ["glow_rear", "wheel_rear_fold", [0, 4.3, 11.8]],
      ["wheel_rear_strut", "body", [0, 4.3, 11.8]],
      ["wheel_rear_stem", "body", [0, 13.26, 11.8]],
      ["stand", "body", [0, 3.735, 1.045]],
      ["tail_lights", "body", [0, 0, 0]],
      ["seat_0", "body", [0, 16.1, 3.5]],
      ["seat_1", "body", [0, 16.1, 9.5]],
    ] as const;
    expect(geometry.bones.map((b) => b.name)).toEqual(
      expected.map((b) => b[0]),
    );
    for (const [index, bone] of geometry.bones.entries()) {
      expect(bone.parent).toBe(expected[index]?.[1]);
      for (let axis = 0; axis < 3; axis++) {
        expect(bone.pivot[axis]).toBeCloseTo(
          expected[index]?.[2][axis] ?? Number.NaN,
          3,
        );
      }
      expect((bone.rotation ?? []).every((v) => v === 0)).toBe(true);
      if ((bone.rotation ?? []).some((v) => v !== 0)) {
        expect(geometry.bones.some((child) => child.parent === bone.name)).toBe(
          false,
        );
      }
      if (bone.name.startsWith("seat_") || bone.name.endsWith("_fold")) {
        expect(bone.cubes ?? []).toEqual([]);
      }
    }
  });

  it("keeps struts outside every fold ancestry", () => {
    for (const name of ["wheel_front_strut", "wheel_rear_strut"]) {
      let bone = geometry.bones.find((b) => b.name === name);
      expect(bone).toBeDefined();
      while (bone?.parent) {
        expect(bone.parent.endsWith("_fold")).toBe(false);
        bone = geometry.bones.find((b) => b.name === bone?.parent);
      }
    }
  });

  it("rejects direct and indirect fold ancestors for either strut", async () => {
    await python.run(`${setup}
from unittest.mock import patch
for strut in d.STRUT_BONES.values():
    for fold in d.FOLD_BONES.values():
        for indirect in (False, True):
            bones=tuple((name, ('bridge' if indirect else fold) if name==strut else parent, pivot)
                        for name,parent,pivot in g.BONES)
            if indirect:
                bones+=(('bridge',fold,(0,0,0)),)
            with patch.object(g, 'BONES', bones):
                try:
                    g.build()
                except ValueError as error:
                    assert strut in str(error) and 'fold' in str(error).lower()
                else:
                    raise AssertionError('Accepted a strut below a fold bone')
`);
  });

  it("measures stand feet in generated model pixels without undoing the mirror", () => {
    const feet = boneCubes("stand").filter((cube) => cube.origin[1] === 0);
    expect(feet).toHaveLength(2);
    for (const cube of feet) {
      const [min, max] = cubeBounds(cube);
      expect(min).toEqual(cube.origin);
      expect(max).toEqual(
        cube.origin.map((v, axis) => v + (cube.size[axis] ?? 0)),
      );
      expect(min[1]).toBe(0);
      expect(max[1]).toBeGreaterThan(0);
    }
  });

  it("authorizes every compound cube through the exact assembly table", () => {
    assertOneAxis(cubes, metadata.assemblies);
    expect(Object.keys(metadata.assemblies).sort()).toEqual(
      Object.keys(metadata.table).sort(),
    );
    for (const [name, members] of Object.entries(metadata.assemblies)) {
      expect(members).toHaveLength(metadata.table[name]?.cubes ?? -1);
      expect(metadata.table[name]?.owner).toBe("scooter");
    }
    const authorized = new Set(
      Object.values(metadata.assemblies)
        .flat()
        .map((member) => JSON.stringify(member)),
    );
    expect(
      cubes
        .filter(multipleAxes)
        .every((cube) => authorized.has(JSON.stringify(cube))),
    ).toBe(true);
  });

  it("keeps all face rectangles inside the texture and respects the ceiling", () => {
    const { texture_width: width, texture_height: height } =
      geometry.description;
    expect(width).toBeLessThanOrEqual(2048);
    expect(height).toBeLessThanOrEqual(2048);
    for (const cube of cubes) {
      for (const face of Object.values(cube.uv)) {
        const [u = Number.NaN, v = Number.NaN] = face.uv;
        const [w = Number.NaN, h = Number.NaN] = face.uv_size;
        expect(Math.min(u, u + w)).toBeGreaterThanOrEqual(0);
        expect(Math.max(u, u + w)).toBeLessThanOrEqual(width);
        expect(Math.min(v, v + h)).toBeGreaterThanOrEqual(0);
        expect(Math.max(v, v + h)).toBeLessThanOrEqual(height);
      }
    }
    expect(cubes.length).toBeLessThanOrEqual(metadata.ceiling);
  });

  it("aligns area order, whole-vehicle budgets, and assembly coverage", () => {
    expect(AREAS.map((row) => row.area)).toEqual(metadata.areas);
    expect(cubes.length).toBeLessThanOrEqual(metadata.budget);
    expect([...new Set(AREAS.flatMap((row) => row.assemblies))].sort()).toEqual(
      Object.keys(metadata.table).sort(),
    );
  });

  it("keeps head paint cutouts attached to their panels after the final mirror", async () => {
    const checked = Number(
      await python.run(`${setup}
h=load_tool('scooter_head')
a=load_tool('scooter_atlas')
registry=a.RegionRegistry()
h.register_regions(registry)
registered=registry.regions()
h.register_regions(registry)
assert registry.regions()==registered
built=h.build()
assert built==h.build()
panels=[c for c in built['steer'] if c['uv']['south'].region=='head_panels']
k.mirror_to_game([dict(name='steer',pivot=[0,0,0],cubes=panels)])
region=next(r for r in registered if r.name=='head_panels')
tile=d.HEAD_PANEL_TEXELS
checked=0
for index,cube in enumerate(panels):
    u,v=cube['uv']['south']['uv']
    du,dv=cube['uv']['south']['uv_size']
    tx=index % d.HEAD_PANEL_COLUMNS*tile
    ty=index // d.HEAD_PANEL_COLUMNS*tile
    for x in range(tile):
        for y in range(tile):
            actual=region.pixel(int(u+(x+.5)*du/tile),int(v+(y+.5)*dv/tile))
            expected=region.pixel(tx+tile-1-x,ty+y)
            assert actual==expected, (index,x,y,actual,expected)
            checked+=1
print(checked)
`),
    );
    expect(checked).toBeGreaterThan(0);
  });

  for (const row of AREAS) {
    it(`keeps ${row.area} within its bone, assembly, and cube allocation`, async () => {
      const area: { bones: string[]; assemblies: string[]; cubes: number } =
        JSON.parse(
          await python.run(`${setup}
built=load_tool('scooter_'+${JSON.stringify(row.area)}).build()
print(json.dumps(dict(bones=[name for name,cs in built.items() if cs],assemblies=list(built.assemblies),cubes=sum(map(len,built.values())))))
`),
        );
      expect(area.bones.sort()).toEqual([...row.bones].sort());
      expect(area.assemblies.sort()).toEqual([...row.assemblies].sort());
      expect(area.cubes).toBeLessThanOrEqual(
        metadata.allocation[row.area] ?? -1,
      );
    });
  }
});
