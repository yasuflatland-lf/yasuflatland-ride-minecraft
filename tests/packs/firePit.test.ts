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
