import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const textures = [
  ["warp_tool", "items", "item_texture"],
  ["warp_block_top", "blocks", "terrain_texture"],
  ["warp_block_side", "blocks", "terrain_texture"],
] as const;

describe.each(textures)("warp art: %s", (name, folder, atlas) => {
  const path = `textures/${folder}/yasu_build/${name}`;

  it("registers the texture in its atlas", () => {
    const data = JSON.parse(
      readFileSync(`${RP}/textures/${atlas}.json`, "utf8"),
    );
    expect(data.texture_data[`yasu_build_${name}`]).toEqual({ textures: path });
  });

  if (folder === "blocks") {
    it("has opaque 16x16 pixels", () => {
      const { width, height, pixels } = readRgbaPng(`${RP}/${path}.png`);
      expect([width, height]).toEqual([16, 16]);
      expect(
        pixels.every((value, index) => index % 4 !== 3 || value === 255),
      ).toBe(true);
    });
  }
});
