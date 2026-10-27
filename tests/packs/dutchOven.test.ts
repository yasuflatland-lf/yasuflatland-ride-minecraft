import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const bp = "packs/yasu_ride_bp";
const rp = "packs/yasu_ride_rp";
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

it("connects a persistent oven to the synced simmer state, plain lid, stew, and PBR atlas", () => {
  const entity = readJson(`${bp}/entities/yasu_ride/dutch_oven.se.json`)[
    "minecraft:entity"
  ];
  expect(entity.description.identifier).toBe("yasu_ride:dutch_oven");
  expect(entity.description.is_spawnable).toBe(false);
  expect(entity.description.is_summonable).toBe(true);
  expect(entity.description.properties["yasu_ride:simmering"]).toEqual({
    type: "bool",
    default: false,
    client_sync: true,
  });
  expect(entity.components["minecraft:persistent"]).toEqual({});
  expect(entity.components["minecraft:collision_box"]).toEqual({
    width: 0.6,
    height: 0.45,
  });
  const client = readJson(`${rp}/entity/yasu_ride/dutch_oven.ce.json`)[
    "minecraft:client_entity"
  ].description;
  const geometry = readJson(
    `${rp}/models/entity/yasu_ride/dutch_oven.geo.json`,
  )["minecraft:geometry"][0];
  expect(client.geometry.default).toBe(geometry.description.identifier);
  expect(geometry.description.identifier).toBe("geometry.yasu_ride.dutch_oven");
  expect(geometry.description.texture_width).toBe(32);
  expect(geometry.bones.map((b: { name: string }) => b.name)).toEqual([
    "root",
    "body",
    "lid",
    "bail",
    "food",
    "bubbles",
  ]);
  for (const bone of geometry.bones) {
    for (const cube of bone.cubes ?? []) {
      expect(
        (cube.rotation ?? []).filter((n: number) => n !== 0).length,
      ).toBeLessThanOrEqual(1);
    }
  }
  expect(
    geometry.bones.find((b: { name: string }) => b.name === "bubbles").parent,
  ).toBe("food");
  const controller = readJson(
    `${rp}/render_controllers/yasu_ride/dutch_oven.rc.json`,
  ).render_controllers[client.render_controllers[0]];
  expect(controller.part_visibility).toEqual([
    { lid: "!query.property('yasu_ride:simmering')" },
    { food: "query.property('yasu_ride:simmering')" },
  ]);
  expect(client.scripts.animate).toEqual([
    { simmer: "query.property('yasu_ride:simmering')" },
  ]);
  const animation = readJson(`${rp}/animations/yasu_ride/dutch_oven.anim.json`)
    .animations[client.animations.simmer];
  expect(animation.loop).toBe(true);
  expect(animation.bones.bubbles.position).toEqual([
    0,
    "math.sin(query.life_time * 360) * 0.15",
    0,
  ]);
  const atlas = readJson(
    `${rp}/textures/entity/yasu_ride/dutch_oven.texture_set.json`,
  )["minecraft:texture_set"];
  expect(atlas).toEqual({
    color: "dutch_oven",
    metalness_emissive_roughness: "dutch_oven_mer",
  });
  for (const path of [
    `${client.textures.default}.png`,
    "textures/entity/yasu_ride/dutch_oven_mer.png",
    "textures/items/yasu_ride/dutch_oven_item.png",
  ])
    expect(existsSync(`${rp}/${path}`)).toBe(true);
});

it("crafts six iron and one coal into a stackable outside item after the fire pit", () => {
  const recipe = readJson(
    `${bp}/recipes/yasu_ride/dutch_oven_item.recipe.json`,
  )["minecraft:recipe_shaped"];
  expect(recipe.pattern).toEqual([" I ", "ICI", "III"]);
  expect(recipe.key).toEqual({
    I: { item: "minecraft:iron_ingot" },
    C: { item: "minecraft:coal" },
  });
  expect(recipe.result).toEqual({
    item: "yasu_ride:dutch_oven_item",
    count: 1,
  });
  const item = readJson(`${bp}/items/yasu_ride/dutch_oven_item.item.json`)[
    "minecraft:item"
  ];
  expect(item.components["minecraft:max_stack_size"]).toBe(16);
  expect(item.components["minecraft:icon"]).toBe("yasu_ride_dutch_oven_item");
  const categories = readJson(`${bp}/item_catalog/crafting_item_catalog.json`)[
    "minecraft:crafting_items_catalog"
  ].categories;
  const group = categories
    .flatMap((c: { groups: unknown[] }) => c.groups)
    .find((g: { items: string[] }) =>
      g.items.includes("yasu_ride:fire_pit_item"),
    );
  expect(group.items[group.items.indexOf("yasu_ride:fire_pit_item") + 1]).toBe(
    "yasu_ride:dutch_oven_item",
  );
  for (const lang of readdirSync(`${rp}/texts`).filter((f) =>
    f.endsWith(".lang"),
  )) {
    const text = readFileSync(`${rp}/texts/${lang}`, "utf8");
    if (!text.includes("entity.yasu_ride:fire_pit.name=")) continue;
    for (const key of [
      "entity.yasu_ride:dutch_oven.name",
      "item.yasu_ride:dutch_oven_item.name",
      "action.interact.yasu_ride.dutch_oven",
      "yasu_ride.hint.dutch_oven_hits",
    ])
      expect(text).toContain(`${key}=`);
  }
  const manifest = readJson(`${rp}/manifest.json`);
  expect(manifest.header.version).toEqual([0, 1, 173]);
  expect(manifest.modules[0].version).toEqual([0, 1, 173]);
  const dependency = readJson(`${bp}/manifest.json`).dependencies.find(
    (d: { uuid: string }) => d.uuid === manifest.header.uuid,
  );
  expect(dependency.version).toEqual(manifest.header.version);
});
