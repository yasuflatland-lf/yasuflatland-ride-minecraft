import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FURNITURE_SPEC } from "../../src/domain/resort/furniture";
import { FURNITURE_IDS } from "../../src/infrastructure/resort/identifiers";
import { readRgbaPng } from "../support/png";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const ids = FURNITURE_IDS.sofa_double;
const entity = read(`${BP}/entities/yasu_ride/sofa_double.se.json`)[
  "minecraft:entity"
];
const model = read(`${RP}/models/entity/yasu_ride/sofa_double.geo.json`)[
  "minecraft:geometry"
][0];

describe("Sofa (Double) pack contract", () => {
  it("is persistent, immovable and immune to damage with two vanilla seats", () => {
    expect(entity.description).toEqual({
      identifier: ids.entity,
      is_spawnable: false,
      is_summonable: true,
    });
    const c = entity.components;
    expect(c["minecraft:type_family"].family).toEqual([
      "yasu_ride_sofa_double",
      "inanimate",
    ]);
    expect(c["minecraft:physics"]).toEqual({
      has_collision: true,
      has_gravity: true,
    });
    expect(c["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(c["minecraft:damage_sensor"].triggers.deals_damage).toBe("no");
    expect(c["minecraft:persistent"]).toEqual({});
    expect(c["minecraft:rideable"]).toMatchObject({
      seat_count: 2,
      family_types: ["player"],
      interact_text: "action.interact.yasu_ride.sit",
      crouching_skip_interact: true,
    });
    expect(c["minecraft:rideable"].seats).toEqual(
      FURNITURE_SPEC.sofa_double.seats.map(({ x, y, z }) => ({
        position: [x, y, z],
      })),
    );
    // Vanilla riders sit about 0.24 blocks above the rideable anchor, as on the Low Chair.
    const seat = model.bones[0].cubes.find(
      (c: { origin: number[]; size: number[]; rotation?: number[] }) =>
        Math.abs((c.origin[1] ?? 0) + (c.size[1] ?? 0) - 7.8) < 1e-6 &&
        !c.rotation,
    );
    expect(seat).toBeDefined();
    for (const anchor of FURNITURE_SPEC.sofa_double.seats)
      expect(anchor.y).toBeCloseTo((seat.origin[1] + seat.size[1]) / 16 - 0.24);
    expect(c["minecraft:collision_box"]).toEqual({ width: 2, height: 0.8 });
    expect(c["minecraft:custom_hit_test"].hitboxes).toEqual([
      { width: 0.95, height: 0.8, pivot: [-0.5, 0.4, 0] },
      { width: 0.95, height: 0.8, pivot: [0.5, 0.4, 0] },
    ]);
  });

  it("fits every rotated corner inside two cells and the collision and hit boxes", () => {
    const box = entity.components["minecraft:collision_box"];
    const hits = entity.components["minecraft:custom_hit_test"].hitboxes;
    for (const cube of model.bones[0].cubes) {
      for (let n = 0; n < 8; n++) {
        const point = cube.origin.map(
          (v: number, i: number) => v + cube.size[i] * ((n >> i) & 1),
        );
        const pivot = cube.pivot ?? [0, 0, 0];
        let [x, y, z] = point.map((v: number, i: number) => v - pivot[i]);
        const [rx, ry, rz] = (cube.rotation ?? [0, 0, 0]).map(
          (v: number) => (v * Math.PI) / 180,
        );
        [y, z] = [
          y * Math.cos(rx) + z * Math.sin(rx),
          -y * Math.sin(rx) + z * Math.cos(rx),
        ];
        [x, z] = [
          x * Math.cos(ry) + z * Math.sin(ry),
          -x * Math.sin(ry) + z * Math.cos(ry),
        ];
        [x, y] = [
          x * Math.cos(rz) + y * Math.sin(rz),
          -x * Math.sin(rz) + y * Math.cos(rz),
        ];
        const final = [x + pivot[0], y + pivot[1], z + pivot[2]].map(
          (v) => v / 16,
        );
        for (const axis of [0, 2]) {
          expect(Math.abs(final[axis] ?? 0)).toBeLessThanOrEqual(
            (axis === 0 ? 0.975 : 0.475) + 1e-6,
          );
          expect(Math.abs(final[axis] ?? 0)).toBeLessThanOrEqual(box.width / 2);
        }
        expect(final[1]).toBeGreaterThanOrEqual(0);
        expect(final[1]).toBeLessThanOrEqual(box.height);
        expect(
          hits.some(
            (hit: { width: number; height: number; pivot: number[] }) =>
              [0, 2].every(
                (axis) =>
                  Math.abs((final[axis] ?? 0) - (hit.pivot[axis] ?? 0)) <=
                  hit.width / 2 + 1e-6,
              ) &&
              Math.abs((final[1] ?? 0) - (hit.pivot[1] ?? 0)) <=
                hit.height / 2 + 1e-6,
          ),
        ).toBe(true);
      }
    }
  });

  it("connects client geometry, texture and dedicated render controller", () => {
    const c = read(`${RP}/entity/yasu_ride/sofa_double.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(c.identifier).toBe(ids.entity);
    expect(c.geometry.default).toBe(model.description.identifier);
    expect(c.geometry.default).toBe("geometry.yasu_ride.sofa_double");
    expect(existsSync(`${RP}/${c.textures.default}.png`)).toBe(true);
    const rc = read(`${RP}/render_controllers/yasu_ride/sofa_double.rc.json`)
      .render_controllers[c.render_controllers[0]];
    expect(rc).toEqual({
      geometry: "Geometry.default",
      materials: [{ "*": "Material.default" }],
      textures: ["Texture.default"],
    });
    const png = readRgbaPng(`${RP}/${c.textures.default}.png`);
    expect(png.width).toBe(png.height);
    expect(Math.log2(png.width)).toBe(Math.floor(Math.log2(png.width)));
    expect(png.width).toBe(model.description.texture_width);
    expect(png).toEqual(
      readRgbaPng(`${RP}/textures/entity/yasu_ride/sofa_single.png`),
    );
  });

  it("supplies an unstackable item, a unique plank-stick-wool recipe and catalog position", () => {
    const item = read(`${BP}/items/yasu_ride/sofa_double_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(ids.item);
    expect(item.components["minecraft:max_stack_size"]).toBe(1);
    expect(item.components["minecraft:icon"]).toBe("yasu_ride_sofa_double");
    const recipe = read(`${BP}/recipes/yasu_ride/sofa_double_item.recipe.json`)[
      "minecraft:recipe_shaped"
    ];
    expect(recipe.description.identifier).toBe(ids.item);
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.pattern).toEqual(["WWW", "WWW", "SPS"]);
    expect(recipe.key).toEqual({
      P: { tag: "minecraft:planks" },
      W: { tag: "minecraft:wool" },
      S: { item: "minecraft:stick" },
    });
    expect(recipe.result).toEqual({ item: ids.item, count: 1 });
    const signature = (r: typeof recipe, mirror = false) =>
      r.pattern
        .map((row: string) => {
          const keys = [...row];
          if (mirror) keys.reverse();
          return keys.map((k) => JSON.stringify(r.key[k] ?? null)).join(",");
        })
        .join(";");
    for (const file of readdirSync(`${BP}/recipes/yasu_ride`)) {
      if (file === "sofa_double_item.recipe.json") continue;
      const other = read(`${BP}/recipes/yasu_ride/${file}`)[
        "minecraft:recipe_shaped"
      ];
      if (other)
        for (const mirror of [false, true])
          expect(signature(other, mirror), file).not.toBe(signature(recipe));
    }
    const groups = read(`${BP}/item_catalog/crafting_item_catalog.json`)[
      "minecraft:crafting_items_catalog"
    ].categories[0].groups;
    const group = groups.find(
      (g: { group_identifier: { name: string } }) =>
        g.group_identifier.name === "yasu_ride:resort_gear",
    );
    expect(group.items.indexOf(ids.item)).toBe(
      group.items.indexOf("yasu_ride:sofa_single_item") + 1,
    );
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data
        .yasu_ride_sofa_double,
    ).toEqual({ textures: "textures/items/yasu_ride/sofa_double_item" });
    for (const [path, size] of [
      [`${RP}/textures/items/yasu_ride/sofa_double_item.png`, 32],
      ["docs/images/items/camping-gear/sofa_double.png", 128],
    ] as const) {
      const png = readRgbaPng(path);
      expect([png.width, png.height]).toEqual([size, size]);
      expect(png.pixels.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    }
  });

  it.each(["en_US", "ja_JP"])(
    "localizes item, entity, sitting and all shared furniture hints in %s",
    (locale) => {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const key of [
        "item.yasu_ride:sofa_double_item.name",
        "entity.yasu_ride:sofa_double.name",
        "action.interact.yasu_ride.sit",
        ...[
          "blocked",
          "hits_left",
          "taken",
          "occupied",
          "something_on_top",
        ].map((s) => `yasu_ride.furniture.${s}`),
      ]) {
        expect(
          lang
            .split("\n")
            .some(
              (line) =>
                line.startsWith(`${key}=`) && line.length > key.length + 1,
            ),
        ).toBe(true);
      }
      if (locale === "en_US")
        expect(lang).toContain(
          "item.yasu_ride:sofa_double_item.name=Sofa (Double)\n",
        );
    },
  );
});
