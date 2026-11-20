import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { id } from "../../src/infrastructure/shared/identifiers";
import {
  GIFT_CONTENTS,
  GIFT_ITEM,
  GIFT_LORE,
  GIFT_RECEIVED_PROPERTY,
  giftOfItem,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { readTableRows } from "../support/markdown";
import { readRgbaPng } from "../support/png";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const GROUP = id("sportsboat_equipment");
const BOX = id("sportsboat_equipment_box");
const SWITCH = id("icebreaker_switch");

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// Keep Japanese names escaped so only the translation file contains CJK text.
const JA_EQUIPMENT = "\u8239\u306e\u88c5\u5099";
const NAMES: Record<string, Record<string, string>> = {
  en_US: {
    [GROUP]: "Sports Boat Equipment",
    [`item.${BOX}.name`]: "Sports Boat Equipment Box",
    [`item.${SWITCH}.name`]: "Icebreaker Switch",
    "yasu_ride.lore.sportsboat_equipment": "Sports Boat Equipment",
  },
  ja_JP: {
    [GROUP]: JA_EQUIPMENT,
    [`item.${BOX}.name`]: `${JA_EQUIPMENT}\u30dc\u30c3\u30af\u30b9`,
    [`item.${SWITCH}.name`]: "\u7815\u6c37\u30b9\u30a4\u30c3\u30c1",
    "yasu_ride.lore.sportsboat_equipment": JA_EQUIPMENT,
  },
};

function icon(name: string) {
  return readRgbaPng(`${RP}/textures/items/yasu_ride/${name}.png`);
}

describe("Sports Boat Equipment (ADR 0171)", () => {
  it.each([
    ["sportsboat_equipment_box", BOX, "none"],
    ["icebreaker_switch", SWITCH, "items"],
  ])(
    "ships %s as a single-stack item with a registered icon",
    (name, type, category) => {
      expect(read(`${BP}/items/yasu_ride/${name}.item.json`)).toMatchObject({
        "minecraft:item": {
          description: { identifier: type, menu_category: { category } },
          components: {
            "minecraft:icon": `yasu_ride_${name}`,
            "minecraft:max_stack_size": 1,
            "minecraft:use_modifiers": {
              use_duration: 0.1,
              movement_modifier: 1.0,
            },
            "minecraft:display_name": { value: `item.${type}.name` },
          },
        },
      });
      expect(
        read(`${RP}/textures/item_texture.json`).texture_data[
          `yasu_ride_${name}`
        ],
      ).toEqual({ textures: `textures/items/yasu_ride/${name}` });
    },
  );

  it("opens the box into the icebreaker switch with its own lore line and received property", () => {
    expect(GIFT_ITEM.sportsboat_equipment_box).toBe(BOX);
    expect(giftOfItem(BOX)).toBe("sportsboat_equipment_box");
    expect(GIFT_CONTENTS.sportsboat_equipment_box).toEqual([SWITCH]);
    expect(GIFT_LORE.sportsboat_equipment_box).toBe(
      "yasu_ride.lore.sportsboat_equipment",
    );
    expect(GIFT_RECEIVED_PROPERTY.sportsboat_equipment_box).toBe(
      "yasu_ride:sportsboat_equipment_given",
    );
    expect(GIFT_RECEIVED_PROPERTY.sportsboat_equipment_box).not.toBe(
      GIFT_RECEIVED_PROPERTY.camping_gear_box,
    );
  });

  it("draws the helm in wood and brass, with none of the blue of the logo it was shaped after", () => {
    const texels = Array.from(icon("sportsboat_equipment_box").pixels);
    const bluish = texels.filter(
      (_, i) =>
        i % 4 === 0 &&
        (texels[i + 3] ?? 0) > 0 &&
        (texels[i + 2] ?? 0) >= (texels[i] ?? 0),
    );
    expect(bluish).toEqual([]);
  });

  it("crafts the switch from a lever, an iron ingot, and packed ice, unlocked from the start, and gives the box no recipe", () => {
    const recipe = read(
      `${BP}/recipes/yasu_ride/icebreaker_switch.recipe.json`,
    )["minecraft:recipe_shapeless"];
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(
      recipe.ingredients.map((i: { item: string }) => i.item).sort(),
    ).toEqual([
      "minecraft:iron_ingot",
      "minecraft:lever",
      "minecraft:packed_ice",
    ]);
    expect(
      existsSync(
        `${BP}/recipes/yasu_ride/sportsboat_equipment_box.recipe.json`,
      ),
    ).toBe(false);
  });

  it.each(Object.entries(NAMES))(
    "names the group, both items, and the lore line in %s",
    (locale, names) => {
      const values = new Map(
        readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
          .split("\n")
          .map((line) => {
            const i = line.indexOf("=");
            return [line.slice(0, i), line.slice(i + 1)];
          }),
      );
      for (const [key, text] of Object.entries(names))
        expect(values.get(key)).toBe(text);
    },
  );

  it("counts the group on the item groups page", () => {
    expect(readTableRows("docs/items/README.md")).toContain(
      "| **Sports Boat Equipment** | 1 | [Icebreaker Switch](sportsboat-equipment.md) |",
    );
    expect(existsSync("docs/items/sportsboat-equipment.md")).toBe(true);
  });
});
