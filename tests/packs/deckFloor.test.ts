import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { defined } from "../support/defined";
import type { Json } from "../support/packFiles";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const blockFile = read(`${BP}/blocks/yasu_ride/deck_floor.block.json`);
const block = blockFile["minecraft:block"] as {
  description: {
    identifier: string;
    menu_category: Json;
    states: Json;
  };
  components: Json;
  permutations: { condition: string; components: Json }[];
};
const heights = Array.from({ length: 16 }, (_, i) => i + 1);

describe("Boat deck floor (ADR 0063)", () => {
  it("is hidden from inventory and selection, indestructible, and has no loot", () => {
    expect(blockFile.format_version).toBe("1.21.80");
    expect(block.description.identifier).toBe("yasu_ride:deck_floor");
    expect(block.description.menu_category).toEqual({ category: "none" });
    expect(block.components["minecraft:selection_box"]).toBe(false);
    expect(block.components["minecraft:destructible_by_mining"]).toBe(false);
    expect(block.components["minecraft:destructible_by_explosion"]).toBe(false);
    expect(block.components).not.toHaveProperty("minecraft:loot");
    expect(block.components["minecraft:light_dampening"]).toBe(0);
    expect(block.components["minecraft:material_instances"]).toEqual({
      "*": { texture: "glass", render_method: "alpha_test" },
    });
  });

  it("defines one collision height permutation for each pixel from 1 to 16", () => {
    expect(block.description.states).toEqual({ "yasu_ride:height": heights });
    expect(block.permutations).toEqual(
      heights.map((height) => ({
        condition: `q.block_state('yasu_ride:height') == ${height}`,
        components: {
          "minecraft:collision_box": {
            origin: [-8, 0, -8],
            size: [16, height, 16],
          },
        },
      })),
    );
  });

  // DockBlocks resolves the floor permutation by these script constants, so
  // they must name the block and the state the pack actually defines.
  it("is the block the script lays floors with", () => {
    expect(DECK_FLOOR_BLOCK).toBe(block.description.identifier);
  });

  it("selects each collision height by the state the script sets", () => {
    const states = block.description.states as Record<string, number[]>;
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 16 }), (height) => {
        expect(states[DECK_FLOOR_HEIGHT_STATE]).toContain(height);
        expect(
          block.permutations.some(
            (p) =>
              p.condition ===
              `q.block_state('${DECK_FLOOR_HEIGHT_STATE}') == ${height}`,
          ),
        ).toBe(true);
      }),
    );
  });

  it("references the hidden-cube model and hides its bone (ADR 0101)", () => {
    const file = read(`${RP}/models/blocks/yasu_ride/deck_floor.geo.json`);
    expect(file.format_version).toBe("1.12.0");
    expect(block.components["minecraft:geometry"]).toEqual({
      identifier: "geometry.yasu_ride.deck_floor",
      bone_visibility: { root: false },
    });
    expect(file["minecraft:geometry"]).toEqual([
      {
        description: {
          identifier: "geometry.yasu_ride.deck_floor",
          texture_width: 16,
          texture_height: 16,
        },
        bones: [
          {
            name: "root",
            pivot: [0, 0, 0],
            cubes: [{ origin: [-0.5, 0, -0.5], size: [1, 1, 1], uv: [0, 0] }],
          },
        ],
      },
    ]);
  });

  it.each(["en_US", "ja_JP"])("names the block in %s", (locale) => {
    const names = readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("tile.yasu_ride:deck_floor.name="))
      .map((line) => line.slice(line.indexOf("=") + 1));
    expect(names).toHaveLength(1);
    expect(defined(names[0], locale).trim()).not.toBe("");
    if (locale === "en_US") expect(names[0]).toBe("Boat Deck");
  });
});
