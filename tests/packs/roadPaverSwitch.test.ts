import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { id } from "../../src/infrastructure/shared/identifiers";
import { readRgbaPng } from "../support/png";

const TYPE = id("road_paver_switch");

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// Keep Japanese names escaped so only the translation file contains CJK text.
const JA_ITEM_NAME = "\u30ed\u30fc\u30c9\u30da\u30fc\u30d0\u30fc";

describe("Road Paver switch (ADR 0181)", () => {
  it("is a single-stack item that fires on a long press, with its icon and name", () => {
    expect(
      read("packs/yasu_ride_bp/items/yasu_ride/road_paver_switch.item.json"),
    ).toEqual({
      format_version: "1.21.80",
      "minecraft:item": {
        description: { identifier: TYPE, menu_category: { category: "items" } },
        components: {
          "minecraft:icon": "yasu_ride_road_paver_switch",
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
        .yasu_ride_road_paver_switch,
    ).toEqual({ textures: "textures/items/yasu_ride/road_paver_switch" });
    const { width, height, pixels } = readRgbaPng(
      "packs/yasu_ride_rp/textures/items/yasu_ride/road_paver_switch.png",
    );
    expect([width, height]).toEqual([16, 16]);
    expect(pixels[3]).toBe(0);
    expect(
      Array.from(pixels).some((alpha, i) => i % 4 === 3 && alpha === 255),
    ).toBe(true);
  });
  it("is crafted from a lever, an iron ingot, and cobblestone and unlocked from the start", () => {
    expect(
      read(
        "packs/yasu_ride_bp/recipes/yasu_ride/road_paver_switch.recipe.json",
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
          { item: "minecraft:cobblestone" },
        ],
        result: { item: TYPE, count: 1 },
      },
    });
  });
  it("is a cab monitor tool with an off and an on screen", () => {
    expect(
      read("tools/monitor_screens.json").bulldozer.filter(
        (s: { item: string }) => s.item === "road_paver_switch",
      ),
    ).toEqual([
      { item: "road_paver_switch", state: "off", label: "OFF" },
      { item: "road_paver_switch", state: "on", label: "ON" },
    ]);
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
      locale === "en_US" ? "Road Paver" : JA_ITEM_NAME,
    );
  });
});
