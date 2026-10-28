import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { id } from "../../src/infrastructure/shared/identifiers";
import { readRgbaPng } from "../support/png";

const TYPE = id("blade_switch");

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// Keep Japanese names escaped so only the translation file contains CJK text.
const JA_ITEM_NAME = "\u30d6\u30ec\u30fc\u30c9\u4e0a\u4e0b";
const JA_GROUP_NAME =
  "\u30d6\u30eb\u30c9\u30fc\u30b6\u30fc\u7528\u30b9\u30a4\u30c3\u30c1";

describe("Blade Up/Down switch (ADR 0138)", () => {
  it("is a single-stack item that fires on a long press, with its icon and name", () => {
    expect(
      read("packs/yasu_ride_bp/items/yasu_ride/blade_switch.item.json"),
    ).toEqual({
      format_version: "1.21.80",
      "minecraft:item": {
        description: { identifier: TYPE, menu_category: { category: "items" } },
        components: {
          "minecraft:icon": "yasu_ride_blade_switch",
          "minecraft:max_stack_size": 1,
          "minecraft:use_modifiers": {
            use_duration: 0.1,
            movement_modifier: 1.0,
          },
          "minecraft:display_name": { value: `item.${TYPE}.name` },
        },
      },
    });
    expect(
      read("packs/yasu_ride_rp/textures/item_texture.json").texture_data
        .yasu_ride_blade_switch,
    ).toEqual({ textures: "textures/items/yasu_ride/blade_switch" });
    const { width, height, pixels } = readRgbaPng(
      "packs/yasu_ride_rp/textures/items/yasu_ride/blade_switch.png",
    );
    expect([width, height]).toEqual([16, 16]);
    expect(pixels[3]).toBe(0);
    expect(
      Array.from(pixels).some((alpha, i) => i % 4 === 3 && alpha === 255),
    ).toBe(true);
  });
  it("is crafted from a lever and an iron ingot and unlocked from the start", () => {
    const recipe = read(
      "packs/yasu_ride_bp/recipes/yasu_ride/blade_switch.recipe.json",
    )["minecraft:recipe_shapeless"];
    expect(recipe.result).toEqual({ item: TYPE, count: 1 });
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(
      recipe.ingredients.map((i: { item: string }) => i.item).sort(),
    ).toEqual(["minecraft:iron_ingot", "minecraft:lever"]);
  });
  it.each(["en_US", "ja_JP"])(
    "names the item and its group in %s",
    (locale) => {
      const values = new Map(
        readFileSync(`packs/yasu_ride_rp/texts/${locale}.lang`, "utf8")
          .split("\n")
          .map((line) => {
            const i = line.indexOf("=");
            return [line.slice(0, i), line.slice(i + 1)];
          }),
      );
      expect(values.get(`item.${TYPE}.name`)).toBe(
        locale === "en_US" ? "Blade Up/Down" : JA_ITEM_NAME,
      );
      expect(values.get("yasu_ride:bulldozer_switches")).toBe(
        locale === "en_US" ? "Bulldozer Switches" : JA_GROUP_NAME,
      );
    },
  );
  it("is the only item of the Bulldozer Switches group, which comes after the camping gear groups", () => {
    const groups = read(
      "packs/yasu_ride_bp/item_catalog/crafting_item_catalog.json",
    )["minecraft:crafting_items_catalog"].categories.find(
      (c: { category_name: string }) => c.category_name === "items",
    ).groups;
    expect(
      groups.map(
        (g: { group_identifier: { name: string } }) => g.group_identifier.name,
      ),
    ).toEqual([
      "yasu_ride:camping_gear_inside",
      "yasu_ride:camping_gear_outside",
      "yasu_ride:bulldozer_switches",
      "yasu_ride:sportsboat_equipment",
    ]);
    expect(groups[2]).toEqual({
      group_identifier: { icon: TYPE, name: "yasu_ride:bulldozer_switches" },
      items: [TYPE],
    });
  });
  it("counts the group on the item groups page", () => {
    expect(readFileSync("docs/items/README.md", "utf8")).toContain(
      "| **Bulldozer Switches** | 1 | [Blade Up/Down](bulldozer-switches.md) |",
    );
    expect(existsSync("docs/items/bulldozer-switches.md")).toBe(true);
  });
});
