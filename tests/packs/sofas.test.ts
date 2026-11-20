import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FURNITURE_SPEC } from "../../src/domain/resort/furniture";
import { FURNITURE_IDS } from "../../src/infrastructure/resort/identifiers";
import { defined } from "../support/defined";
import { type Bone, type Triple, turnedCorners } from "../support/geometry";
import { readLang } from "../support/lang";
import { readRgbaPng } from "../support/png";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

const sofas = [
  {
    kind: "sofa_single",
    name: "Sofa (Single)",
    pattern: ["PWP", "WWW", "SPS"],
  },
  {
    kind: "sofa_double",
    name: "Sofa (Double)",
    pattern: ["WWW", "WWW", "SPS"],
  },
] as const;

describe.each(sofas)("$name pack contract", ({ kind, name, pattern }) => {
  const ids = FURNITURE_IDS[kind];
  const { seats } = FURNITURE_SPEC[kind];
  const { components, description } = read(
    `${BP}/entities/yasu_ride/${kind}.se.json`,
  )["minecraft:entity"];
  const [model] = read(`${RP}/models/entity/yasu_ride/${kind}.geo.json`)[
    "minecraft:geometry"
  ];
  const bone: Bone = model.bones[0];
  const cubes = defined(bone.cubes, "sofa cubes");
  const hitWidth = 0.95;
  const height = 0.8;
  const hits = Array.from({ length: seats.length }, (_, index) => ({
    width: hitWidth,
    height,
    pivot: [index - (seats.length - 1) / 2, height / 2, 0] as Triple,
  }));

  it("places the vanilla seats below the cushion and gives each one a hitbox", () => {
    expect(description).toMatchObject({
      identifier: ids.entity,
      is_spawnable: false,
    });
    expect(components["minecraft:rideable"]).toMatchObject({
      seat_count: seats.length,
      family_types: ["player"],
      interact_text: "action.interact.yasu_ride.sit",
      crouching_skip_interact: true,
      seats: seats.map(({ x, y, z }) => ({ position: [x, y, z] })),
    });
    // Vanilla riders sit about 0.24 blocks above the rideable anchor (ADR 0122).
    const seat = defined(
      cubes.find(
        ({ origin, size, rotation }) =>
          !rotation && Math.abs(origin[1] + size[1] - 7.8) < 1e-6,
      ),
      "seat cushion",
    );
    for (const { y } of seats)
      expect(y).toBeCloseTo((seat.origin[1] + seat.size[1]) / 16 - 0.24);
    expect(components["minecraft:collision_box"]).toEqual({
      width: seats.length,
      height,
    });
    expect(components["minecraft:custom_hit_test"].hitboxes).toEqual(hits);
  });

  it("fits every rotated corner inside the collision and hit boxes", () => {
    const box = components["minecraft:collision_box"];
    for (const cube of cubes) {
      for (const [px, py, pz] of turnedCorners(bone, cube)) {
        const x = px / 16;
        const y = py / 16;
        const z = pz / 16;
        expect(Math.abs(x)).toBeLessThanOrEqual(box.width / 2);
        expect(Math.abs(z)).toBeLessThanOrEqual(hitWidth / 2 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(box.height);
        expect(
          hits.some(
            ({ pivot, width }) => Math.abs(x - pivot[0]) <= width / 2 + 1e-6,
          ),
        ).toBe(true);
      }
    }
  });

  it("connects the geometry and shared sofa texture to its render controller", () => {
    const client = read(`${RP}/entity/yasu_ride/${kind}.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.identifier).toBe(ids.entity);
    expect(client.geometry.default).toBe(`geometry.yasu_ride.${kind}`);
    expect(client.geometry.default).toBe(model.description.identifier);
    expect(client.textures.default).toBe(
      "textures/entity/yasu_ride/sofa_single",
    );
    const controller = read(
      `${RP}/render_controllers/yasu_ride/${kind}.rc.json`,
    ).render_controllers[client.render_controllers[0]];
    expect(controller).toEqual({
      geometry: "Geometry.default",
      materials: [{ "*": "Material.default" }],
      textures: ["Texture.default"],
    });
    const png = readRgbaPng(`${RP}/${client.textures.default}.png`);
    expect(png.width).toBe(png.height);
    expect(Math.log2(png.width) % 1).toBe(0);
    expect(png.width).toBe(model.description.texture_width);
  });

  it("supplies an unstackable item, its recipe ingredients and preview", () => {
    const item = read(`${BP}/items/yasu_ride/${kind}_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(ids.item);
    const iconKey = `yasu_ride_${kind}`;
    expect(item.components["minecraft:max_stack_size"]).toBe(1);
    expect(item.components["minecraft:icon"]).toBe(iconKey);
    const recipe = read(`${BP}/recipes/yasu_ride/${kind}_item.recipe.json`)[
      "minecraft:recipe_shaped"
    ];
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.pattern).toEqual(pattern);
    expect(recipe.key).toEqual({
      P: { tag: "minecraft:planks" },
      W: { tag: "minecraft:wool" },
      S: { item: "minecraft:stick" },
    });
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data[iconKey],
    ).toEqual({
      textures: `textures/items/yasu_ride/${kind}_item`,
    });
    const preview = readRgbaPng(`docs/images/items/camping-gear/${kind}.png`);
    expect([preview.width, preview.height]).toEqual([128, 128]);
    expect(
      preview.pixels.some((value, index) => index % 4 === 3 && value === 255),
    ).toBe(true);
    expect(
      readLang(`${RP}/texts/en_US.lang`).get(`item.${ids.item}.name`),
    ).toBe(name);
  });
});

it.each(["en_US", "ja_JP"])(
  "localizes sitting and the shared furniture hints in %s",
  (locale) => {
    const lang = readLang(`${RP}/texts/${locale}.lang`);
    expect(lang.get("action.interact.yasu_ride.sit")).toBeTruthy();
    for (const hint of [
      "blocked",
      "hits_left",
      "taken",
      "occupied",
      "something_on_top",
    ])
      expect(lang.get(`yasu_ride.furniture.${hint}`)).toBeTruthy();
  },
);
