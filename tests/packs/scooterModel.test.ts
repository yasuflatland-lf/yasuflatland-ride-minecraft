import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";
import { assertOneAxis, multipleAxes } from "./oneAxis";

type Cube = {
  origin: number[];
  size: number[];
  rotation?: number[];
  uv: Record<string, { uv: number[]; uv_size: number[] }>;
};
type Bone = {
  name: string;
  parent?: string;
  pivot: number[];
  rotation?: number[];
  cubes?: Cube[];
};
type AreaRow = {
  area: string;
  bones: readonly string[];
  assemblies: readonly string[];
  cubes: number;
};
// One row per area module (issues 6 to 11 each append one row).
// biome-ignore format: Keep independent area additions to a single line group.
const AREAS: readonly AreaRow[] = [
  { area: "rear", bones: ["body", "tail_lights"], assemblies: ["rear_seat", "rear_lamp", "rear_plate"], cubes: 257 },
  { area: "body", bones: ["body"], assemblies: ["body_cowl", "body_tail", "body_frame", "body_floor"], cubes: 1150 },
  { area: "shield", bones: ["body", "steer"], assemblies: ["shield_face", "shield_trim", "shield_ridge", "shield_fender"], cubes: 650 },
  { area: "head", bones: ["steer", "headlights"], assemblies: ["head_collar", "head_headset", "head_bib", "head_meter", "head_lamp", "head_controls", "head_levers", "head_mirrors"], cubes: 520 },
  { area: "running", bones: ["wheel_front", "wheel_rear", "steer", "stand"], assemblies: ["running_wheel_front", "running_wheel_rear", "running_spring", "running_stand"], cubes: 650 },
  { area: "engine", bones: ["body"], assemblies: ["engine_casting", "engine_fan", "engine_kick", "engine_muffler", "engine_header"], cubes: 320 },
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
};
const geometry = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/scooter.geo.json",
    "utf8",
  ),
)["minecraft:geometry"][0] as {
  bones: Bone[];
  description: { texture_width: number; texture_height: number };
};
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
print(json.dumps(g.rounded(dict(areas=g.AREA_ORDER,table=g.ASSEMBLIES,assemblies=merged.assemblies,budget=d.CUBE_BUDGET,ceiling=d.CUBE_BUDGET_CEILING,axis=d.STEERING_AXIS_DEGREES))))
`),
  );
});

describe("scooter generated foundation", () => {
  it("keeps the exact ordered bone contract without rest rotations", () => {
    const steerZ =
      -11.8 + (17.9 - 4.3) * Math.tan((metadata.axis * Math.PI) / 180);
    const expected = [
      ["root", undefined, [0, 0, 0]],
      ["body", "root", [0, 0, 0]],
      ["steer", "root", [0, 17.9, steerZ]],
      ["wheel_front_fold", "steer", [0, 4.3, -11.8]],
      ["wheel_front", "wheel_front_fold", [0, 4.3, -11.8]],
      ["headlights", "steer", [0, 0, 0]],
      ["wheel_rear_fold", "body", [0, 4.3, 11.8]],
      ["wheel_rear", "wheel_rear_fold", [0, 4.3, 11.8]],
      ["stand", "body", [0, 5, 2]],
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

  it("authorizes every compound cube through the exact assembly table", () => {
    assertOneAxis(cubes, metadata.assemblies);
    expect(Object.keys(metadata.assemblies).sort()).toEqual(
      Object.keys(metadata.table).sort(),
    );
    for (const [name, members] of Object.entries(metadata.assemblies)) {
      expect(members).toHaveLength(metadata.table[name]?.cubes ?? -1);
      expect(metadata.table[name]?.owner).toBe("scooter");
    }
    expect(
      cubes.filter(multipleAxes).every((cube) =>
        Object.values(metadata.assemblies)
          .flat()
          .some((member) => JSON.stringify(member) === JSON.stringify(cube)),
      ),
    ).toBe(true);
  });

  it("keeps all face rectangles inside the texture and respects the ceiling", () => {
    const { texture_width: width, texture_height: height } =
      geometry.description;
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
    expect(
      AREAS.reduce((total, row) => total + row.cubes, 0),
    ).toBeLessThanOrEqual(metadata.budget);
    expect(AREAS.flatMap((row) => row.assemblies).sort()).toEqual(
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
      expect(area.cubes).toBeLessThanOrEqual(row.cubes);
    });
  }
});
