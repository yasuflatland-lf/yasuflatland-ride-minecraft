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
import { expectSingleStackUseItem } from "../support/itemContract";
import { readLang } from "../support/lang";
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
    "yasu_ride.lore.sportsboat_equipment": "Sports Boat Equipment",
  },
  ja_JP: {
    [GROUP]: JA_EQUIPMENT,
    [`item.${BOX}.name`]: `${JA_EQUIPMENT}\u30dc\u30c3\u30af\u30b9`,
    "yasu_ride.lore.sportsboat_equipment": JA_EQUIPMENT,
  },
};

function icon(name: string) {
  return readRgbaPng(`${RP}/textures/items/yasu_ride/${name}.png`);
}

describe("Sports Boat Equipment (ADR 0171)", () => {
  it("ships the hidden equipment box with a registered icon", () => {
    expectSingleStackUseItem(BOX, "none");
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data
        .yasu_ride_sportsboat_equipment_box,
    ).toEqual({
      textures: "textures/items/yasu_ride/sportsboat_equipment_box",
    });
  });

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

  it("gives the equipment box no recipe", () => {
    expect(
      existsSync(
        `${BP}/recipes/yasu_ride/sportsboat_equipment_box.recipe.json`,
      ),
    ).toBe(false);
  });

  it.each(Object.entries(NAMES))(
    "names the group, the box, and the lore line in %s",
    (locale, names) => {
      const values = readLang(`${RP}/texts/${locale}.lang`);
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
