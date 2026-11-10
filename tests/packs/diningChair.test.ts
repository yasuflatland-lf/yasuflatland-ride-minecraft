import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FURNITURE_SPEC } from "../../src/domain/resort/furniture";
import { FURNITURE_IDS } from "../../src/infrastructure/resort/identifiers";
import { readRgbaPng } from "../support/png";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const entity = read(`${BP}/entities/yasu_ride/dining_chair.se.json`)[
  "minecraft:entity"
];
const components = entity.components;
const spec = FURNITURE_SPEC.dining_chair;

describe("Dining Chair assets (ADR 0240)", () => {
  it("provides a persistent, damage-immune, unpushable player seat matching the domain", () => {
    expect(entity.description).toEqual({
      identifier: FURNITURE_IDS.dining_chair.entity,
      is_spawnable: false,
      is_summonable: true,
    });
    expect(components["minecraft:type_family"].family).toEqual([
      "yasu_ride_dining_chair",
      "inanimate",
    ]);
    expect(components["minecraft:persistent"]).toEqual({});
    expect(components["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(components["minecraft:knockback_resistance"].value).toBe(1);
    expect(components["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
    expect(components["minecraft:physics"]).toEqual({
      has_collision: true,
      has_gravity: true,
    });
    expect(components["minecraft:collision_box"]).toEqual({
      width: 0.6,
      height: 0.85,
    });
    const seat = spec.seats[0];
    expect(components["minecraft:rideable"]).toEqual({
      seat_count: 1,
      family_types: ["player"],
      interact_text: "action.interact.yasu_ride.sit",
      crouching_skip_interact: true,
      seats: [{ position: [seat?.x, seat?.y, seat?.z] }],
    });
    expect(seat?.y).toBeCloseTo(7.2 / 16 - 0.24);
    expect(seat?.z).toBeCloseTo((-4.4 + 4.2) / 32);
  });

  it("uses the woven model, texture and dedicated render controller", () => {
    const client = read(`${RP}/entity/yasu_ride/dining_chair.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.identifier).toBe(FURNITURE_IDS.dining_chair.entity);
    expect(client.geometry.default).toBe("geometry.yasu_ride.dining_chair");
    expect(client.textures.default).toBe(
      "textures/entity/yasu_ride/dining_chair",
    );
    const controller = read(
      `${RP}/render_controllers/yasu_ride/dining_chair.rc.json`,
    ).render_controllers[client.render_controllers[0]];
    expect(controller).toEqual({
      geometry: "Geometry.default",
      materials: [{ "*": "Material.default" }],
      textures: ["Texture.default"],
    });
    const geo = read(`${RP}/models/entity/yasu_ride/dining_chair.geo.json`)[
      "minecraft:geometry"
    ][0];
    expect(geo.description.identifier).toBe(client.geometry.default);
    const png = readRgbaPng(`${RP}/textures/entity/yasu_ride/dining_chair.png`);
    expect([png.width, png.height]).toEqual([
      geo.description.texture_width,
      geo.description.texture_height,
    ]);
  });

  it("covers every rotated model corner with a whole-chair hitbox and keeps the back reclined", () => {
    const bounds = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `
import json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('gen_dining_chair')
t = load_tool('cube_tilt')
g = json.loads(Path('${RP}/models/entity/yasu_ride/dining_chair.geo.json').read_text())['minecraft:geometry'][0]
p = g['bones'][0]['cubes']
m.validate(p)
lo, hi = t.bounds(p)
b = t.corners(p[-m.BACK_PANELS + m.BACK_PANELS // 2])
print(json.dumps({'lo': lo, 'hi': hi, 'baseZ': b[0][2], 'topZ': b[2][2]}))
`,
        ],
        { encoding: "utf8" },
      ),
    );
    expect(bounds.topZ).toBeGreaterThan(bounds.baseZ);
    expect(bounds.lo[1]).toBeCloseTo(0, 6);
    expect(bounds.hi[1]).toBeLessThanOrEqual(13);
    const boxes = components["minecraft:custom_hit_test"].hitboxes;
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    for (let axis = 0; axis < 3; axis++) {
      const half = (axis === 1 ? box.height : box.width) * 8;
      expect(bounds.lo[axis]).toBeGreaterThanOrEqual(
        box.pivot[axis] * 16 - half,
      );
      expect(bounds.hi[axis]).toBeLessThanOrEqual(box.pivot[axis] * 16 + half);
    }
  });

  it("lists the third Resort Gear item and supplies distinct ingredients, both names, preview and icon", () => {
    const catalog = read(`${BP}/item_catalog/crafting_item_catalog.json`);
    expect(JSON.stringify(catalog)).toContain(
      '"items":["yasu_ride:beach_parasol_item","yasu_ride:beach_chair_item","yasu_ride:dining_chair_item"]',
    );
    const item = read(`${BP}/items/yasu_ride/dining_chair_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(FURNITURE_IDS.dining_chair.item);
    expect(item.components["minecraft:icon"]).toBe("yasu_ride_dining_chair");
    expect(item.components["minecraft:display_name"].value).toBe(
      "item.yasu_ride:dining_chair_item.name",
    );
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data
        .yasu_ride_dining_chair,
    ).toEqual({ textures: "textures/items/yasu_ride/dining_chair_item" });
    const recipe = read(
      `${BP}/recipes/yasu_ride/dining_chair_item.recipe.json`,
    )["minecraft:recipe_shaped"];
    expect(recipe.pattern).toEqual(["P  ", "PPP", "SIS"]);
    expect(recipe.key).toEqual({
      P: { tag: "minecraft:planks" },
      S: { item: "minecraft:stick" },
      I: { item: "minecraft:iron_ingot" },
    });
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.result).toEqual({
      item: FURNITURE_IDS.dining_chair.item,
      count: 1,
    });
    const grids = (r: typeof recipe) => {
      const rows: string[][] = r.pattern.map((row: string) =>
        [...row].map((key) => JSON.stringify(r.key[key] ?? null)),
      );
      while (rows[0]?.every((cell) => cell === "null")) rows.shift();
      while (rows.at(-1)?.every((cell) => cell === "null")) rows.pop();
      while (rows.length && rows.every((row) => row[0] === "null"))
        for (const row of rows) row.shift();
      while (rows.length && rows.every((row) => row.at(-1) === "null"))
        for (const row of rows) row.pop();
      return [
        JSON.stringify(rows),
        JSON.stringify(rows.map((row) => [...row].reverse())),
      ];
    };
    const expected = grids(recipe);
    for (const file of readdirSync(`${BP}/recipes/yasu_ride`)) {
      if (file === "dining_chair_item.recipe.json") continue;
      const other = read(`${BP}/recipes/yasu_ride/${file}`)[
        "minecraft:recipe_shaped"
      ];
      if (other)
        for (const grid of grids(other))
          expect(expected, file).not.toContain(grid);
    }
    for (const [locale, name] of [
      ["en_US", "Dining Chair"],
      ["ja_JP", "\u30c0\u30a4\u30cb\u30f3\u30b0\u30c1\u30a7\u30a2\u30fc"],
    ]) {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const prefix of [
        "item.yasu_ride:dining_chair_item",
        "entity.yasu_ride:dining_chair",
      ])
        expect(lang).toContain(`${prefix}.name=${name}\n`);
    }
    for (const [path, size] of [
      ["docs/images/items/camping-gear/dining_chair.png", 128],
      [`${RP}/textures/items/yasu_ride/dining_chair_item.png`, 32],
    ] as const) {
      const png = readRgbaPng(path);
      expect([png.width, png.height]).toEqual([size, size]);
      expect(png.pixels[3]).toBe(0);
      expect(png.pixels.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    }
  });
});
