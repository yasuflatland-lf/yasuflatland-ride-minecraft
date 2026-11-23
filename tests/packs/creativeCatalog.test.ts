import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CAMPING_GEAR_IDS } from "../../src/domain/vehicle/kinds";
import { BULLDOZER_MONITOR } from "../../src/domain/vehicle/kinds/bulldozer/monitor";
import { SPORTSBOAT_MONITOR } from "../../src/domain/vehicle/kinds/sportsboat/equipment";
import {
  BUILD_UNDO_TYPE,
  PASTE_PLACE_TYPE,
  PASTE_ROTATE_TYPE,
  SELECTION_WAND_TYPE,
} from "../../src/infrastructure/build/identifiers";
import {
  CAMP_TABLE_ITEM,
  CHAIR_KINDS,
  DUTCH_OVEN_ITEM,
  FIRE_PIT_ITEM,
  GAS_LANTERN_ITEM,
  ROOF_TENT_ITEM,
  TENT_ITEM,
} from "../../src/infrastructure/camp/identifiers";
import { id } from "../../src/infrastructure/shared/identifiers";
import {
  GIFT_CONTENTS,
  GIFT_ITEM,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import {
  WARP_BLOCK_TYPE,
  WARP_TOOL_TYPE,
} from "../../src/infrastructure/warp/identifiers";
import {
  BULLDOZER_PACK_CONTRACT,
  SPORTSBOAT_PACK_CONTRACT,
} from "../support/packContract";
import { jsonFiles } from "../support/packFiles";
import { RESORT_CATALOG_ITEMS } from "../support/resortGear";

const BP = "packs/yasu_ride_bp";
const campingGear: { id: string }[] = JSON.parse(
  readFileSync("tools/camping_gear.json", "utf8"),
);
const decor = campingGear.map((item) => id(item.id));

function group(name: string, items: readonly string[]) {
  return { group_identifier: { name, icon: items[0] }, items };
}

const groups = [
  group(id("camping_gear_inside"), [GIFT_ITEM.camping_gear_box, ...decor]),
  group(id("camping_gear_outside"), [
    CHAIR_KINDS.low_chair.itemId,
    CHAIR_KINDS.noga_chair.itemId,
    TENT_ITEM,
    ROOF_TENT_ITEM,
    CAMP_TABLE_ITEM,
    FIRE_PIT_ITEM,
    DUTCH_OVEN_ITEM,
    GAS_LANTERN_ITEM,
  ]),
  group(id("resort_gear"), RESORT_CATALOG_ITEMS),
  group(
    SPORTSBOAT_PACK_CONTRACT.monitorGroup,
    SPORTSBOAT_MONITOR.tools.map(({ item }) => id(item)),
  ),
  group(BULLDOZER_PACK_CONTRACT.monitorGroup, [
    SELECTION_WAND_TYPE,
    PASTE_ROTATE_TYPE,
    PASTE_PLACE_TYPE,
    BUILD_UNDO_TYPE,
    ...BULLDOZER_MONITOR.tools.map(({ item }) => id(item)),
    WARP_TOOL_TYPE,
    WARP_BLOCK_TYPE,
  ]),
];

it("lists all five creative groups and their items in order", () => {
  const catalog = JSON.parse(
    readFileSync(`${BP}/item_catalog/crafting_item_catalog.json`, "utf8"),
  );
  expect(catalog["minecraft:crafting_items_catalog"].categories).toEqual([
    { category_name: "items", groups },
  ]);
  expect(decor).toEqual(CAMPING_GEAR_IDS.map(id));
  expect(decor).toEqual(GIFT_CONTENTS.camping_gear_box);

  const items = groups.flatMap((group) => group.items);
  expect(groups).toHaveLength(5);
  expect(items.length).toBeGreaterThanOrEqual(47);
  expect(new Set(items).size).toBe(items.length);
  const available = new Set(
    [
      ...jsonFiles(`${BP}/items`).map((json) => json["minecraft:item"]),
      ...jsonFiles(`${BP}/blocks`).map((json) => json["minecraft:block"]),
    ].map(
      (entry) =>
        (entry as { description: { identifier: string } }).description
          .identifier,
    ),
  );
  expect(items.filter((item) => !available.has(item))).toEqual([]);
});
