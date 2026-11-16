import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const definition = read(
  "packs/yasu_ride_bp/blocks/yasu_build/warp_block.block.json",
);
const block = definition["minecraft:block"];

describe("Warp Block pack definition", () => {
  it("exposes a full cube in the Items tab with the deferred custom component", () => {
    expect(definition.format_version).toBe("1.21.80");
    expect(block.description).toEqual({
      identifier: "yasu_build:warp_block",
      menu_category: { category: "items" },
    });
    expect(block.components["minecraft:geometry"]).toBe(
      "minecraft:geometry.full_block",
    );
    expect(block.components["minecraft:collision_box"]).toBe(true);
    expect(block.components["minecraft:selection_box"]).toBe(true);
    expect(block.components["minecraft:custom_components"]).toEqual([
      "yasu_build:warp_block",
    ]);
  });

  it("wires the opaque scope top and side panels to generated terrain textures", () => {
    const materials = block.components["minecraft:material_instances"];
    expect(materials).toEqual({
      "*": { texture: "yasu_build_warp_block_side", render_method: "opaque" },
      up: { texture: "yasu_build_warp_block_top", render_method: "opaque" },
    });
    const atlas = read("packs/yasu_ride_rp/textures/terrain_texture.json");
    for (const face of ["up", "down", "north", "south", "east", "west"]) {
      const material = materials[face] ?? materials["*"];
      const name = face === "up" ? "warp_block_top" : "warp_block_side";
      expect(atlas.texture_data[material.texture]).toEqual({
        textures: `textures/blocks/yasu_build/${name}`,
      });
    }
  });
});
