import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { assertOneAxis, multipleAxes } from "./oneAxis";

const rp = "packs/yasu_ride_test_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const geo = read(`${rp}/models/entity/yasu_ride_test/rotation_probe.geo.json`)[
  "minecraft:geometry"
][0];
const client = read(`${rp}/entity/yasu_ride_test/rotation_probe.ce.json`)[
  "minecraft:client_entity"
].description;
const entity = read(
  "packs/yasu_ride_test_bp/entities/yasu_ride_test/rotation_probe.se.json",
)["minecraft:entity"];
const controllers = read(
  `${rp}/render_controllers/yasu_ride_test/rotation_probe.rc.json`,
).render_controllers;
type Vector = number[];
type Cube = { origin: Vector; size: Vector; pivot: Vector; rotation: Vector };
type Bone = {
  name: string;
  parent?: string;
  pivot: Vector;
  rotation?: Vector;
  cubes?: Cube[];
};
const bones: Bone[] = geo.bones;

function turn(v: Vector, rotation: Vector): Vector {
  let [x, y, z] = v as [number, number, number];
  for (const axis of [0, 1, 2]) {
    const angle =
      (((rotation[axis] ?? 0) * Math.PI) / 180) * (axis === 1 ? 1 : -1);
    const c = Math.cos(angle),
      s = Math.sin(angle);
    if (axis === 0) [y, z] = [c * y - s * z, s * y + c * z];
    if (axis === 1) [x, z] = [c * x + s * z, -s * x + c * z];
    if (axis === 2) [x, y] = [c * x - s * y, s * x + c * y];
  }
  return [x, y, z];
}

it("resolves the summon-only probe assets", () => {
  expect(entity.description).toEqual({
    identifier: "yasu_ride_test:rotation_probe",
    is_spawnable: false,
    is_summonable: true,
  });
  expect(entity.components["minecraft:persistent"]).toEqual({});
  expect(entity.components["minecraft:physics"]).toEqual({
    has_gravity: false,
    has_collision: false,
  });
  expect(client.identifier).toBe(entity.description.identifier);
  expect(client.geometry.default).toBe(geo.description.identifier);
  expect(client.render_controllers).toEqual([
    "controller.render.yasu_ride_test.rotation_probe",
  ]);
  expect(controllers[client.render_controllers[0]].textures).toEqual([
    "Texture.default",
  ]);
  expect(
    readFileSync(`${rp}/${client.textures.default}.png`).subarray(0, 8),
  ).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

it("matches each compound cube with its one-axis reference at every corner", () => {
  expect(bones.map((bone) => bone.name)).toEqual([
    "root",
    "compound_0",
    "reference_0",
    "compound_1",
    "reference_1",
    "compound_2",
    "reference_2",
  ]);
  const compounds = bones
    .filter((b) => b.name.startsWith("compound_"))
    .flatMap((b) => b.cubes ?? []);
  const cubes = bones.flatMap((b) => b.cubes ?? []);
  expect(compounds).toHaveLength(3);
  expect(compounds.every(multipleAxes)).toBe(true);
  assertOneAxis(cubes, { comparisons: compounds });
  for (let i = 0; i < 3; i++) {
    const compound = compounds[i] as Cube;
    const referenceBone = bones.find(
      (b) => b.name === `reference_${i}`,
    ) as Bone;
    const reference = referenceBone.cubes?.[0] as Cube;
    expect(referenceBone.parent).toBe("root");
    expect(multipleAxes(reference)).toBe(false);
    expect(multipleAxes(referenceBone)).toBe(false);
    for (let corner = 0; corner < 8; corner++) {
      const offset = (cube: Cube) =>
        cube.origin.map(
          (v, axis) =>
            v +
            (cube.size[axis] ?? 0) * ((corner >> axis) & 1) -
            (cube.pivot[axis] ?? 0),
        );
      const actual = turn(offset(compound), compound.rotation);
      const expected = turn(
        turn(offset(reference), reference.rotation),
        referenceBone.rotation ?? [],
      );
      actual.forEach((v, axis) => {
        expect(v).toBeCloseTo(expected[axis] as number, 5);
      });
    }
  }
});
