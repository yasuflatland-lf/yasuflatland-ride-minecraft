import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { id } from "../../src/infrastructure/shared/identifiers";
import { readRgbaPng } from "../support/png";

const TYPE = id("wide_blade_switch");

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// Keep Japanese names escaped so only the translation file contains CJK text.
const JA_ITEM_NAME = "\u30ef\u30a4\u30c9\u30d6\u30ec\u30fc\u30c9";

describe("Wide Blade switch (ADR 0180)", () => {
  it("is a single-stack item that fires on a long press, with its icon and name", () => {
    expect(
      read("packs/yasu_ride_bp/items/yasu_ride/wide_blade_switch.item.json"),
    ).toEqual({
      format_version: "1.21.80",
      "minecraft:item": {
        description: { identifier: TYPE, menu_category: { category: "items" } },
        components: {
          "minecraft:icon": "yasu_ride_wide_blade_switch",
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
        .yasu_ride_wide_blade_switch,
    ).toEqual({ textures: "textures/items/yasu_ride/wide_blade_switch" });
    const { width, height, pixels } = readRgbaPng(
      "packs/yasu_ride_rp/textures/items/yasu_ride/wide_blade_switch.png",
    );
    expect([width, height]).toEqual([16, 16]);
    expect(pixels[3]).toBe(0);
    expect(
      Array.from(pixels).some((alpha, i) => i % 4 === 3 && alpha === 255),
    ).toBe(true);
  });
  it("is crafted from a lever and two iron ingots and unlocked from the start", () => {
    expect(
      read(
        "packs/yasu_ride_bp/recipes/yasu_ride/wide_blade_switch.recipe.json",
      ),
    ).toEqual({
      format_version: "1.20.10",
      "minecraft:recipe_shapeless": {
        description: { identifier: TYPE },
        tags: ["crafting_table"],
        unlock: { context: "AlwaysUnlocked" },
        ingredients: [
          { item: "minecraft:lever" },
          { item: "minecraft:iron_ingot" },
          { item: "minecraft:iron_ingot" },
        ],
        result: { item: TYPE, count: 1 },
      },
    });
  });
  it("is not a cab monitor tool until the wide blade state exists (5/16)", () => {
    expect(readFileSync("tools/monitor_screens.json", "utf8")).not.toContain(
      "wide_blade_switch",
    );
    expect(
      readFileSync("src/domain/vehicle/kinds/bulldozer/monitor.ts", "utf8"),
    ).not.toContain("wide_blade_switch");
  });
  it.each(["en_US", "ja_JP"])("names the item in %s", (locale) => {
    const values = new Map(
      readFileSync(`packs/yasu_ride_rp/texts/${locale}.lang`, "utf8")
        .split("\n")
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    );
    expect(values.get(`item.${TYPE}.name`)).toBe(
      locale === "en_US" ? "Wide Blade" : JA_ITEM_NAME,
    );
  });
});
