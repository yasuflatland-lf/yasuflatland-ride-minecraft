import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const { texture_data: textures } = JSON.parse(
  readFileSync(`${RP}/textures/item_texture.json`, "utf8"),
) as { texture_data: Record<string, { textures: string | string[] }> };

const cornerExceptions = new Map<string, { opacity: number[]; reason: string }>(
  [
    [
      "yasu_ride_suv_item",
      {
        opacity: [255, 255, 255, 255],
        reason: "The SUV has a full-bleed background.",
      },
    ],
    [
      "yasu_ride_headlight_switch",
      {
        opacity: [255, 255, 255, 255],
        reason: "The high-beam symbol is drawn on a solid black tile.",
      },
    ],
    [
      "yasu_ride_icebreaker_switch",
      {
        opacity: [0, 0, 255, 255],
        reason: "The ice extends through the lower corners.",
      },
    ],
    [
      "yasu_build_paste_rotate",
      {
        opacity: [255, 255, 255, 255],
        reason: "The glyph is drawn on a solid yellow control tile.",
      },
    ],
    [
      "yasu_build_paste_place",
      {
        opacity: [255, 255, 255, 255],
        reason: "The glyph is drawn on a solid yellow control tile.",
      },
    ],
    [
      "yasu_build_build_undo",
      {
        opacity: [255, 255, 255, 255],
        reason: "The glyph is drawn on a solid yellow control tile.",
      },
    ],
  ],
);

const entries = Object.entries(textures).map(([key, entry]) => ({
  key,
  paths: [entry.textures].flat(),
}));

it("covers at least 53 registered item icons", () => {
  expect(entries.length).toBeGreaterThanOrEqual(53);
  expect(Object.keys(textures)).toEqual(
    expect.arrayContaining([...cornerExceptions.keys()]),
  );
});

it.each(entries)(
  "$key is a small square icon with visible artwork",
  ({ key, paths }) => {
    expect(paths.length, key).toBeGreaterThan(0);
    const exception = cornerExceptions.get(key);
    for (const path of paths) {
      const { width, height, pixels } = readRgbaPng(`${RP}/${path}.png`);
      expect([16, 32], path).toContain(width);
      expect(height, path).toBe(width);
      const corners = [0, width - 1, (height - 1) * width, width * height - 1];
      expect(
        corners.map((corner) => pixels[4 * corner + 3]),
        exception?.reason ?? path,
      ).toEqual(exception?.opacity ?? [0, 0, 0, 0]);
      expect(
        pixels.some((channel, index) => index % 4 === 3 && channel === 255),
        path,
      ).toBe(true);
    }
  },
);
