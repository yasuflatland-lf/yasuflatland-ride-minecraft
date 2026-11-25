import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BOOSTER_TYPE } from "../../src/infrastructure/vehicle/bedrock/identifiers";

it("exposes the booster as a single-stack creative item without a recipe", () => {
  const item = JSON.parse(
    readFileSync(
      "packs/yasu_ride_bp/items/yasu_ride/booster.item.json",
      "utf8",
    ),
  )["minecraft:item"];
  const headlight = JSON.parse(
    readFileSync(
      "packs/yasu_ride_bp/items/yasu_ride/headlight_switch.item.json",
      "utf8",
    ),
  )["minecraft:item"];
  expect(item.description).toEqual({
    identifier: BOOSTER_TYPE,
    menu_category: headlight.description.menu_category,
  });
  expect(item.components["minecraft:max_stack_size"]).toBe(1);
  expect(item.components["minecraft:icon"]).toBe("yasu_ride_booster");
  expect(
    existsSync("packs/yasu_ride_bp/recipes/yasu_ride/booster.recipe.json"),
  ).toBe(false);
  for (const locale of ["en_US", "ja_JP"]) {
    const lang = readFileSync(
      `packs/yasu_ride_rp/texts/${locale}.lang`,
      "utf8",
    );
    for (const key of [
      "item.yasu_ride:booster.name",
      "yasu_ride.message.boost_on",
      "yasu_ride.message.boost_off",
      "yasu_ride.message.boost_unavailable",
    ]) {
      expect(lang).toMatch(
        new RegExp(`^${key.replaceAll(".", "\\.")}=.+$`, "m"),
      );
    }
  }
});
