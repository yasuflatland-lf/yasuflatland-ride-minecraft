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
    "ships %s as a single-stack item with a 16 x 16 icon",
    (name, type, category) => {
      expect(read(`${BP}/items/yasu_ride/${name}.item.json`)).toEqual({
        format_version: "1.21.80",
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
      const { width, height, pixels } = icon(name);
      expect([width, height]).toEqual([16, 16]);
      expect(pixels[3]).toBe(0);
      expect(
        Array.from(pixels).some((alpha, i) => i % 4 === 3 && alpha === 255),
      ).toBe(true);
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

  it("lists only the Icebreaker Switch in a group after the outside camping gear, with the switch as its icon", () => {
    const categories = read(`${BP}/item_catalog/crafting_item_catalog.json`)[
      "minecraft:crafting_items_catalog"
    ].categories;
    const groups = categories.find(
      (c: { category_name: string }) => c.category_name === "items",
    ).groups;
    const names = groups.map(
      (g: { group_identifier: { name: string } }) => g.group_identifier.name,
    );
    expect(names.indexOf(GROUP)).toBe(
      names.indexOf(id("camping_gear_outside")) + 1,
    );
    expect(groups[names.indexOf(GROUP)]).toEqual({
      group_identifier: { icon: SWITCH, name: GROUP },
      items: [SWITCH],
    });
    for (const category of categories)
      for (const group of category.groups)
        expect(group.items).not.toContain(BOX);
  });

  it("crafts the switch from a lever, an iron ingot, and packed ice, unlocked from the start, and gives the box no recipe", () => {
    const recipe = read(
      `${BP}/recipes/yasu_ride/icebreaker_switch.recipe.json`,
    )["minecraft:recipe_shapeless"];
    expect(recipe.result).toEqual({ item: SWITCH, count: 1 });
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
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

  it("ships RP 0.1.221 and matches the BP dependency", () => {
    const rp = read(`${RP}/manifest.json`);
    expect(rp.header.version).toEqual([0, 1, 221]);
    expect(rp.modules[0].version).toEqual(rp.header.version);
    expect(
      read(`${BP}/manifest.json`).dependencies.find(
        (d: { uuid: string }) => d.uuid === rp.header.uuid,
      ).version,
    ).toEqual(rp.header.version);
  });

  it("counts the group on the item groups page", () => {
    expect(readFileSync("docs/items/README.md", "utf8")).toContain(
      "| **Sports Boat Equipment** | 1 | [Icebreaker Switch](sportsboat-equipment.md) |",
    );
    expect(existsSync("docs/items/sportsboat-equipment.md")).toBe(true);
  });
});
