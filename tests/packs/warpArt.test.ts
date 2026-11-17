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

  it("has visible 16x16 pixels and the required transparency", () => {
    const { width, height, pixels } = readRgbaPng(`${RP}/${path}.png`);
    expect([width, height]).toEqual([16, 16]);
    const alpha = Array.from(pixels).filter((_, index) => index % 4 === 3);
    expect(alpha.some((value) => value > 0)).toBe(true);
    if (folder === "blocks") {
      expect(alpha.every((value) => value === 255)).toBe(true);
    } else {
      for (const corner of [0, 15, 240, 255]) {
        expect(alpha[corner]).toBe(0);
      }
    }
  });
});
