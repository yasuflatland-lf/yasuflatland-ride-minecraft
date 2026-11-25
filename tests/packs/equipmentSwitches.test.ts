import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BLADE_SWITCH,
  ROAD_PAVER_SWITCH,
  WIDE_BLADE_SWITCH,
} from "../../src/domain/vehicle/kinds/bulldozer/equipment";
import { ICEBREAKER_SWITCH } from "../../src/domain/vehicle/kinds/sportsboat/equipment";
import { expectSingleStackUseItem } from "../support/itemContract";
import { readLang } from "../support/lang";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

const switches = [
  {
    id: BLADE_SWITCH.item,
    name: {
      en_US: "Blade Up/Down",
      ja_JP: "\u30d6\u30ec\u30fc\u30c9\u4e0a\u4e0b",
    },
    ingredients: ["lever", "iron_ingot"],
    vehicle: "bulldozer",
    screens: [
      ["down", "DOWN"],
      ["up", "UP"],
    ],
  },
  {
    id: WIDE_BLADE_SWITCH.item,
    name: {
      en_US: "Wide Blade",
      ja_JP: "\u30ef\u30a4\u30c9\u30d6\u30ec\u30fc\u30c9",
    },
    ingredients: ["lever", "iron_ingot", "iron_ingot"],
    vehicle: "bulldozer",
    screens: [
      ["normal", "NORM"],
      ["wide", "WIDE"],
    ],
  },
  {
    id: ROAD_PAVER_SWITCH.item,
    name: {
      en_US: "Road Paver",
      ja_JP: "\u30ed\u30fc\u30c9\u30da\u30fc\u30d0\u30fc",
    },
    ingredients: ["lever", "iron_ingot", "cobblestone"],
    vehicle: "bulldozer",
    screens: [
      ["off", "OFF"],
      ["on", "ON"],
    ],
  },
  {
    id: ICEBREAKER_SWITCH.item,
    name: {
      en_US: "Icebreaker Switch",
      ja_JP: "\u7815\u6c37\u30b9\u30a4\u30c3\u30c1",
    },
    ingredients: ["lever", "iron_ingot", "packed_ice"],
    vehicle: "sportsboat",
    screens: [
      ["off", "OFF"],
      ["on", "ON"],
    ],
  },
];

describe.each(switches)(
  "$name.en_US switch",
  ({ id, name, ingredients, vehicle, screens }) => {
    const type = `yasu_ride:${id}`;
    it("uses the single-stack item contract and registers its icon", () => {
      expectSingleStackUseItem(type);
      expect(
        read(`${RP}/textures/item_texture.json`).texture_data[
          `yasu_ride_${id}`
        ],
      ).toEqual({
        textures: `textures/items/yasu_ride/${id}`,
      });
    });

    it("crafts from the specified shapeless ingredients", () => {
      const recipe = read(`${BP}/recipes/yasu_ride/${id}.recipe.json`)[
        "minecraft:recipe_shapeless"
      ];
      expect(recipe.tags).toEqual(["crafting_table"]);
      expect(
        recipe.ingredients.map(({ item }: { item: string }) => item).sort(),
      ).toEqual(ingredients.map((item) => `minecraft:${item}`).sort());
    });

    it("defines the named monitor screens", () => {
      expect(
        read("tools/monitor_screens.json")[vehicle].filter(
          (screen: { item: string }) => screen.item === id,
        ),
      ).toEqual(screens.map(([state, label]) => ({ item: id, state, label })));
    });

    it.each(Object.entries(name))("names the switch in %s", (locale, label) => {
      expect(
        readLang(`${RP}/texts/${locale}.lang`).get(`item.${type}.name`),
      ).toBe(label);
    });
  },
);
