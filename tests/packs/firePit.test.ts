import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const bp = "packs/yasu_ride_bp";
const rp = "packs/yasu_ride_rp";
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

it("connects the persistent fire pit, synced flame state, model, and PBR atlas", () => {
  const entity = readJson(`${bp}/entities/yasu_ride/fire_pit.se.json`)[
    "minecraft:entity"
  ];
  expect(entity.description.properties["yasu_ride:lit"]).toMatchObject({
    default: false,
    client_sync: true,
  });
  expect(entity.components["minecraft:persistent"]).toEqual({});
  expect(entity.components["minecraft:interact"].interactions).toHaveLength(1);
  const client = readJson(`${rp}/entity/yasu_ride/fire_pit.ce.json`)[
    "minecraft:client_entity"
  ].description;
  const geometry = readJson(`${rp}/models/entity/yasu_ride/fire_pit.geo.json`)[
    "minecraft:geometry"
  ][0];
  expect(client.geometry.default).toBe(geometry.description.identifier);
  expect(geometry.bones.map((bone: { name: string }) => bone.name)).toContain(
    "embers",
  );
  const controller = readJson(
    `${rp}/render_controllers/yasu_ride/fire_pit.rc.json`,
  ).render_controllers[client.render_controllers[0]];
  expect(controller.part_visibility).toContainEqual({
    embers: "query.property('yasu_ride:lit')",
  });
  const atlas = readJson(
    `${rp}/textures/entity/yasu_ride/fire_pit.texture_set.json`,
  )["minecraft:texture_set"];
  expect(atlas.color).toBe("fire_pit");
  expect(atlas.metalness_emissive_roughness).toBe("fire_pit_mer");
  expect(existsSync(`${rp}/${client.textures.default}.png`)).toBe(true);
  expect(existsSync(`${rp}/textures/entity/yasu_ride/fire_pit_mer.png`)).toBe(
    true,
  );
});

it("syncs grill visibility and keeps the oven standing surface at 12.5 px", () => {
  const properties = readJson(`${bp}/entities/yasu_ride/fire_pit.se.json`)[
    "minecraft:entity"
  ].description.properties;
  expect(properties["yasu_ride:covered"]).toEqual({
    type: "bool",
    default: false,
    client_sync: true,
  });
  const controller = readJson(
    `${rp}/render_controllers/yasu_ride/fire_pit.rc.json`,
  ).render_controllers["controller.render.yasu_ride.fire_pit"];
  expect(controller.part_visibility).toContainEqual({
    grill: "query.property('yasu_ride:covered')",
  });
  const geometry = readJson(`${rp}/models/entity/yasu_ride/fire_pit.geo.json`)[
    "minecraft:geometry"
  ][0];
  const grill = geometry.bones.find(
    (bone: { name: string }) => bone.name === "grill",
  );
  expect(grill).toMatchObject({ parent: "root", pivot: [0, 0, 0] });
  const GRILL_TOP = 12.5;
  expect(readFileSync("tools/gen_fire_pit.py", "utf8")).toContain(
    `GRILL_TOP = ${GRILL_TOP}`,
  );
  const tops = grill.cubes.map(
    (cube: {
      origin: [number, number, number];
      size: [number, number, number];
      rotation?: number[];
    }) => {
      expect(cube.rotation).toBeUndefined();
      expect(cube.origin[1]).toBeGreaterThanOrEqual(11.9);
      for (const axis of [0, 2] as const) {
        expect(cube.origin[axis]).toBeGreaterThanOrEqual(-5.78);
        expect(cube.origin[axis] + cube.size[axis]).toBeLessThanOrEqual(5.78);
      }
      return cube.origin[1] + cube.size[1];
    },
  );
  expect(Math.max(...tops)).toBe(GRILL_TOP);
});

it("advances the Resource Pack patch and keeps the dependency aligned", () => {
  const resource = readJson(`${rp}/manifest.json`);
  expect(resource.header.version.slice(0, 2)).toEqual([0, 1]);
  expect(resource.header.version[2]).toBeGreaterThan(171);
  expect(resource.modules[0].version).toEqual(resource.header.version);
  const dependency = readJson(`${bp}/manifest.json`).dependencies.find(
    (entry: { uuid?: string }) => entry.uuid === resource.header.uuid,
  );
  expect(dependency.version).toEqual(resource.header.version);
});
