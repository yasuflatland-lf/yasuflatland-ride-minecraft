import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CONTENTS,
  GIFT_ITEM,
  GIFT_LORE,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { jsonFiles } from "../support/packFiles";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const BOX = "yasu_ride:camping_gear_box";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const langLines = (locale: string) =>
  readFileSync(`${RP}/texts/${locale}.lang`, "utf8").split(/\r?\n/);
const langValue = (locale: string, key: string) =>
  langLines(locale)
    .filter((line) => line.startsWith(`${key}=`))
    .map((line) => line.slice(key.length + 1));

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("camping gear box (ADR 0093)", () => {
  it("defines the box item that opens on use and does not stack", () => {
    const item = readJson(`${BP}/items/yasu_ride/camping_gear_box.item.json`);
    expect(item).toEqual({
      format_version: "1.21.80",
      "minecraft:item": {
        description: {
          identifier: "yasu_ride:camping_gear_box",
          menu_category: { category: "items" },
        },
        components: {
          "minecraft:icon": "yasu_ride_camping_gear_box",
          "minecraft:max_stack_size": 1,
          "minecraft:use_modifiers": {
            use_duration: 0.1,
            movement_modifier: 1.0,
          },
          "minecraft:display_name": {
            value: "item.yasu_ride:camping_gear_box.name",
          },
        },
      },
    });
    expect(item["minecraft:item"].description.identifier).toBe(
      GIFT_ITEM.camping_gear_box,
    );
  });

  it("holds the gear items of the spec, in spec order", () => {
    const spec: { id: string }[] = readJson("tools/camping_gear.json");
    expect(GIFT_CONTENTS.camping_gear_box).toEqual(
      spec.map((g) => `yasu_ride:${g.id}`),
    );
    expect(GIFT_CONTENTS.camping_gear_box).toHaveLength(19);
    const items = new Set(
      jsonFiles(BP)
        .map(
          (json) =>
            (
              json["minecraft:item"] as {
                description?: { identifier?: string };
              }
            )?.description?.identifier,
        )
        .filter((id) => id !== undefined),
    );
    for (const typeId of GIFT_CONTENTS.camping_gear_box)
      expect(items.has(typeId)).toBe(true);
  });

  it("shows the box as the camping gear group's icon and first item", () => {
    const catalog = readJson(`${BP}/item_catalog/crafting_item_catalog.json`);
    const category = catalog[
      "minecraft:crafting_items_catalog"
    ].categories.find(
      (c: { category_name: string }) => c.category_name === "items",
    );
    const group = category.groups.find(
      (g: { group_identifier: { name: string } }) =>
        g.group_identifier.name === "yasu_ride:camping_gear",
    );
    const items: string[] = group.items;
    expect(group.group_identifier.icon).toBe(BOX);
    expect(items[0]).toBe(BOX);
    expect(items.filter((i) => i === BOX)).toHaveLength(1);
    // The low chair closes the group but is not in the box (ADR 0122)
    expect(items.at(-1)).toBe("yasu_ride:low_chair_item");
    expect(new Set(items.slice(1, -1))).toEqual(
      new Set(GIFT_CONTENTS.camping_gear_box),
    );
  });

  it("maps the box icon to its texture, ahead of the gear icons", () => {
    const data = readJson(`${RP}/textures/item_texture.json`).texture_data;
    expect(data.yasu_ride_camping_gear_box.textures).toBe(
      "textures/items/yasu_ride/camping_gear_box",
    );
    const keys = Object.keys(data);
    expect(keys.indexOf("yasu_ride_camping_gear_box")).toBe(
      keys.indexOf("yasu_ride_potted_plant") - 1,
    );
  });

  it("names the box and the lore line in English", () => {
    const lines = langLines("en_US");
    expect(
      lines.filter(
        (line) =>
          line === "item.yasu_ride:camping_gear_box.name=Camping Gear Box",
      ),
    ).toHaveLength(1);
    expect(
      lines.filter(
        (line) => line === `${GIFT_LORE.camping_gear_box}=Camping gear`,
      ),
    ).toHaveLength(1);
    expect(GIFT_LORE.camping_gear_box).toBe("yasu_ride.lore.camping_gear");
  });

  it.each([
    "item.yasu_ride:camping_gear_box.name",
    "yasu_ride.lore.camping_gear",
  ])("translates %s into Japanese", (key) => {
    const values = langValue("ja_JP", key);
    expect(values).toHaveLength(1);
    expect(values[0]).not.toBe("");
    expect(values[0]).not.toBe(langValue("en_US", key)[0]);
  });

  it("has no recipe", () => {
    for (const path of filesUnder(`${BP}/recipes`))
      expect(readFileSync(path, "utf8")).not.toContain(BOX);
  });

  it("requests the Script API version that shows translated lore", () => {
    expect(readJson(`${BP}/manifest.json`).dependencies).toContainEqual({
      module_name: "@minecraft/server",
      version: "2.2.0",
    });
  });
});
