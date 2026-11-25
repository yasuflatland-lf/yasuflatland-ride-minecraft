import { existsSync, globSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { expect, it } from "vitest";
import { NAV_DESTINATIONS } from "../../src/domain/vehicle/navigation/destinations";
import {
  navDestinationLabelKey,
  navLootTableFile,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

const bp = "packs/yasu_ride_bp";
const rp = "packs/yasu_ride_rp";
const tables = globSync("loot_tables/**/nav_*.json", { cwd: bp });
const destinationOf = (path: string) =>
  basename(path, ".json").slice("nav_".length);

it("ships exactly one loot table for each menu destination", () => {
  expect([...new Set(tables)].sort()).toEqual(
    NAV_DESTINATIONS.map(navLootTableFile).sort(),
  );
});

it("exposes the nav as a single-stack creative item without a recipe", () => {
  const item = JSON.parse(
    readFileSync(`${bp}/items/yasu_ride/nav.item.json`, "utf8"),
  )["minecraft:item"];
  expect(item.description).toEqual({
    identifier: "yasu_ride:nav",
    menu_category: { category: "items" },
  });
  expect(item.components).toMatchObject({
    "minecraft:max_stack_size": 1,
    "minecraft:icon": "yasu_ride_nav",
    "minecraft:display_name": { value: "item.yasu_ride:nav.name" },
  });
  expect(existsSync(`${bp}/recipes/yasu_ride/nav.recipe.json`)).toBe(false);
});

it("registers the 16 by 16 nav icon in the item atlas", () => {
  const atlas = JSON.parse(
    readFileSync(`${rp}/textures/item_texture.json`, "utf8"),
  );
  const texture = "textures/items/yasu_ride/nav";
  expect(atlas.texture_data.yasu_ride_nav).toEqual({ textures: texture });
  const png = readFileSync(`${rp}/${texture}.png`);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([16, 16]);
});

it.each(["en_US", "ja_JP"])(
  "localizes nav names and messages in %s",
  (locale) => {
    const lang = readFileSync(`${rp}/texts/${locale}.lang`, "utf8");
    for (const key of [
      "item.yasu_ride:nav.name",
      "yasu_ride.nav.title",
      "yasu_ride.message.nav_driver_only",
      "yasu_ride.message.nav_overworld_only",
      "yasu_ride.message.nav_nothing_found",
      ...NAV_DESTINATIONS.map(navDestinationLabelKey),
    ]) {
      expect(lang).toMatch(
        new RegExp(`^${key.replaceAll(".", "\\.")}=.+$`, "m"),
      );
    }
  },
);

for (const path of tables) {
  it(`ships an explorer map at ${path}`, () => {
    expect(path).toMatch(/^loot_tables\/yasu_ride\/nav_[a-z0-9_]+\.json$/);
    expect(`yasu_ride_bp/${path}`.length).toBeLessThanOrEqual(80);
    const table = JSON.parse(readFileSync(`${bp}/${path}`, "utf8"));
    expect(table.pools).toEqual([
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            name: "minecraft:empty_map",
            functions: expect.arrayContaining([
              expect.objectContaining({
                function: "exploration_map",
                destination: destinationOf(path),
              }),
            ]),
          }),
        ],
      }),
    ]);
  });
}
