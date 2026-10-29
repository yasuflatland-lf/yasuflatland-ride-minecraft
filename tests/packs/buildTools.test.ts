import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRgbaPng } from "../support/png";

const WAND = "yasu_build:selection_wand";
const TOOL = "yasu_build:build_tool";
const GROUP = "yasu_build:building_tools";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// Keep Japanese names escaped so only the translation file contains CJK text.
const JA = {
  [WAND]: JSON.parse('"\\u7bc4\\u56f2\\u9078\\u629e\\u30ef\\u30f3\\u30c9"'),
  [TOOL]: JSON.parse('"\\u5efa\\u7bc9\\u30c4\\u30fc\\u30eb"'),
  [GROUP]: JSON.parse('"\\u5efa\\u7bc9\\u30c4\\u30fc\\u30eb"'),
};
const EN = {
  [WAND]: "Selection Wand",
  [TOOL]: "Build Tool",
  [GROUP]: "Building Tools",
};

describe.each([
  ["selection_wand", WAND],
  ["build_tool", TOOL],
])("the %s item (ADR 0178)", (name, type) => {
  it("is a single-stack item with its icon and display name", () => {
    expect(
      read(`packs/yasu_ride_bp/items/yasu_build/${name}.item.json`),
    ).toEqual({
      format_version: "1.21.80",
      "minecraft:item": {
        description: { identifier: type, menu_category: { category: "items" } },
        components: {
          "minecraft:icon": `yasu_build_${name}`,
          "minecraft:max_stack_size": 1,
          "minecraft:use_modifiers": {
            use_duration: 0.1,
            movement_modifier: 1.0,
          },
          "minecraft:display_name": { value: `item.${type}.name` },
        },
      },
    });
  });

  it("has a 16x16 icon registered in the item atlas", () => {
    expect(
      read("packs/yasu_ride_rp/textures/item_texture.json").texture_data[
        `yasu_build_${name}`
      ],
    ).toEqual({ textures: `textures/items/yasu_build/${name}` });
    const { width, height, pixels } = readRgbaPng(
      `packs/yasu_ride_rp/textures/items/yasu_build/${name}.png`,
    );
    expect([width, height]).toEqual([16, 16]);
    expect(pixels[3]).toBe(0);
    expect(
      Array.from(pixels).some((alpha, i) => i % 4 === 3 && alpha === 255),
    ).toBe(true);
  });
});

describe("Building Tools recipes and names", () => {
  it.each([
    ["selection_wand", WAND, ["minecraft:copper_ingot", "minecraft:stick"]],
    ["build_tool", TOOL, ["minecraft:chain", "minecraft:iron_ingot"]],
  ])("crafts %s shapeless and unlocked from the start", (name, type, items) => {
    const recipe = read(
      `packs/yasu_ride_bp/recipes/yasu_build/${name}.recipe.json`,
    )["minecraft:recipe_shapeless"];
    expect(recipe.description.identifier).toBe(type);
    expect(recipe.result).toEqual({ item: type, count: 1 });
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(
      recipe.ingredients.map((i: { item: string }) => i.item).sort(),
    ).toEqual(items);
  });

  it.each([
    ["en_US", EN],
    ["ja_JP", JA],
  ])("names both items and the group in %s", (locale, names) => {
    const values = new Map(
      readFileSync(`packs/yasu_ride_rp/texts/${locale}.lang`, "utf8")
        .split("\n")
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    );
    expect(values.get(`item.${WAND}.name`)).toBe(names[WAND]);
    expect(values.get(`item.${TOOL}.name`)).toBe(names[TOOL]);
    expect(values.get(GROUP)).toBe(names[GROUP]);
  });

  it("places the group after the sports boat equipment, with the crane as icon", () => {
    const groups = read(
      "packs/yasu_ride_bp/item_catalog/crafting_item_catalog.json",
    )["minecraft:crafting_items_catalog"].categories.find(
      (c: { category_name: string }) => c.category_name === "items",
    ).groups;
    const names = groups.map(
      (g: { group_identifier: { name: string } }) => g.group_identifier.name,
    );
    expect(names.at(-1)).toBe(GROUP);
    expect(names.at(-2)).toBe("yasu_ride:sportsboat_equipment");
    expect(groups.at(-1)).toEqual({
      group_identifier: { icon: TOOL, name: GROUP },
      items: [
        TOOL,
        WAND,
        "yasu_ride:blade_switch",
        "yasu_ride:wide_blade_switch",
        "yasu_ride:road_paver_switch",
      ],
    });
  });
});
