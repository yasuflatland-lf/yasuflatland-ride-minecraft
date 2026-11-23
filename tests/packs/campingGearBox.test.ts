import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CONTENTS,
  GIFT_ITEM,
  GIFT_LORE,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { readLang } from "../support/lang";
import { jsonFiles } from "../support/packFiles";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const BOX = "yasu_ride:camping_gear_box";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
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
    expect(item).toMatchObject({
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
    expect(GIFT_CONTENTS.camping_gear_box).toHaveLength(spec.length);
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

  it("names the box and the lore line in English", () => {
    const lang = readLang(`${RP}/texts/en_US.lang`);
    expect(lang.get(`item.${BOX}.name`)).toBe("Camping Gear Box");
    expect(lang.get(GIFT_LORE.camping_gear_box)).toBe("Camping gear");
  });

  it.each([
    "item.yasu_ride:camping_gear_box.name",
    "yasu_ride.lore.camping_gear",
  ])("translates %s into Japanese", (key) => {
    const value = readLang(`${RP}/texts/ja_JP.lang`).get(key);
    expect(value).toBeTruthy();
    expect(value).not.toBe(readLang(`${RP}/texts/en_US.lang`).get(key));
  });

  it("has no recipe", () => {
    for (const path of filesUnder(`${BP}/recipes`))
      expect(readFileSync(path, "utf8")).not.toContain(BOX);
  });

  it("requires stable Script API 2.2.0 or later for translated lore", () => {
    const dependencies: { module_name?: string; version: string }[] = readJson(
      `${BP}/manifest.json`,
    ).dependencies;
    const version = dependencies.find(
      ({ module_name }) => module_name === "@minecraft/server",
    )?.version;
    expect(version).toMatch(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    );
    const [major = 0, minor = 0] = (version ?? "").split(".").map(Number);
    expect(major > 2 || (major === 2 && minor >= 2)).toBe(true);
  });
});
