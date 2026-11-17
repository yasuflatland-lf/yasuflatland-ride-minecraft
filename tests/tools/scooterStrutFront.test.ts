import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { expect, it } from "vitest";
import { boneCubes, cubeBounds, loadScooterGeo } from "./helpers/scooterGeo";

type Cube = ReturnType<typeof boneCubes>[number];
const front: {
  collars: Cube[];
  rods: Cube[];
  axleY: number;
  axleZ: number;
  drop: number;
  budget: number;
} = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k=load_tool('scooter_kit')
d=load_tool('scooter_dims')
a=load_tool('scooter_atlas')
s=load_tool('scooter_struts')
result=k.AreaCubes()
s._front(result)
assert not result.assemblies
assert set(result)<= {'steer', 'wheel_front_strut'}
assert all(face.region=='chrome' for cubes in result.values() for c in cubes for face in c['uv'].values())
a.resolve([c for cubes in result.values() for c in cubes],a.pack_layout())
bones=[dict(name=name,pivot=[0,0,0],cubes=cubes) for name,cubes in result.items()]
k.mirror_to_game(bones)
print(json.dumps(dict(collars=result.get('steer',[]),rods=result.get('wheel_front_strut',[]),
                     axleY=d.AXLE_Y,axleZ=d.FRONT_AXLE_Z,drop=d.FOLD_DROP,budget=d.CUBE_BUDGET)))`,
    ],
    { encoding: "utf8" },
  ),
);
const bounds = cubeBounds;
const overlaps = (a: Cube, b: Cube) => {
  const [lo, hi] = bounds(a);
  const [otherLo, otherHi] = bounds(b);
  return ([0, 1, 2] as const).every(
    (axis) =>
      Math.min(hi[axis], otherHi[axis]) > Math.max(lo[axis], otherLo[axis]),
  );
};

it("adds one or two centred chrome cubes per front strut part within the model budget", () => {
  for (const cubes of [front.collars, front.rods]) {
    expect(cubes.length).toBeGreaterThanOrEqual(1);
    expect(cubes.length).toBeLessThanOrEqual(2);
    for (const cube of cubes) {
      expect(cube.rotation ?? [0, 0, 0]).toEqual([0, 0, 0]);
      expect(cube.origin[0] + cube.size[0] / 2).toBeCloseTo(0);
      expect(cube.origin[2] + cube.size[2] / 2).toBeCloseTo(front.axleZ);
    }
  }
  expect(boneCubes("wheel_front_strut")).toHaveLength(front.rods.length);
  expect(
    loadScooterGeo().bones.reduce(
      (sum, bone) => sum + (bone.cubes?.length ?? 0),
      0,
    ),
  ).toBeLessThanOrEqual(front.budget);
});

it("keeps the rod on the hub and inside the wider collar throughout the drop", () => {
  const check = (drop: number) => {
    expect(front.rods.length).toBeGreaterThan(0);
    for (const rod of front.rods) {
      expect(rod.size[0]).toBeCloseTo(0.5);
      expect(rod.size[2]).toBeCloseTo(0.5);
      const moved = {
        ...rod,
        origin: [
          rod.origin[0],
          rod.origin[1] - drop,
          rod.origin[2],
        ] as Cube["origin"],
      };
      expect(bounds(moved)[0][1]).toBeLessThanOrEqual(front.axleY - drop);
      expect(
        front.collars.some(
          (collar) =>
            collar.size[0] > rod.size[0] &&
            collar.size[2] > rod.size[2] &&
            overlaps(moved, collar) &&
            bounds(moved)[1][1] <= bounds(collar)[1][1],
        ),
      ).toBe(true);
    }
  };
  check(0);
  check(front.drop);
  fc.assert(
    fc.property(fc.double({ min: 0, max: front.drop, noNaN: true }), check),
  );
});

it("anchors each collar top inside a fixed fork cube", () => {
  expect(front.collars.length).toBeGreaterThan(0);
  const fixed = boneCubes("steer").filter(
    (cube) =>
      !front.collars.some((c) =>
        ([0, 1, 2] as const).every(
          (i) => Math.abs(c.origin[i] - cube.origin[i]) < 0.001,
        ),
      ),
  );
  for (const collar of front.collars) {
    expect(
      fixed.some(
        (cube) =>
          !cube.rotation &&
          overlaps(collar, cube) &&
          bounds(cube)[0][1] < bounds(collar)[1][1] &&
          bounds(cube)[1][1] >= bounds(collar)[1][1],
      ),
    ).toBe(true);
  }
});

it("hides every front strut cube inside the wheel disc bounds at rest", () => {
  const discs = boneCubes("wheel_front").filter(
    (cube) => !cube.rotation && cube.size[1] > 7 && cube.size[2] > 7,
  );
  expect(discs).toHaveLength(1);
  const disc = discs[0];
  if (!disc) throw new Error("Missing front wheel disc");
  const [lo, hi] = bounds(disc);
  for (const cube of [...front.collars, ...front.rods]) {
    const [min, max] = bounds(cube);
    expect(
      ([0, 1, 2] as const).every(
        (axis) => min[axis] >= lo[axis] && max[axis] <= hi[axis],
      ),
    ).toBe(true);
  }
});
