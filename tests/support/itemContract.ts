import { readFileSync } from "node:fs";
import { expect } from "vitest";

export function expectSingleStackUseItem(
  type: string,
  category = "items",
): void {
  const [namespace, name] = type.split(":");
  const item = JSON.parse(
    readFileSync(
      `packs/yasu_ride_bp/items/${namespace}/${name}.item.json`,
      "utf8",
    ),
  )["minecraft:item"];
  expect(item).toMatchObject({
    description: { identifier: type, menu_category: { category } },
    components: {
      "minecraft:icon": type.replace(":", "_"),
      "minecraft:max_stack_size": 1,
      "minecraft:use_modifiers": {
        use_duration: 0.1,
        movement_modifier: 1,
      },
      "minecraft:display_name": { value: `item.${type}.name` },
    },
  });
}
