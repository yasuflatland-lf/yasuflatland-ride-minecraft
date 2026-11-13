import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../../src/domain/shared/paint";
import { geometry, RP, readPng } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("generates all 16 equally sized paints, changing only the three accent swatches and no region texel", () => {
    const files = readdirSync(`${RP}/textures/entity/yasu_ride`).filter(
      (name) =>
        /^camper(?:_\w+)?\.png$/.test(name) && !name.startsWith("camper_lit"),
    );
    // camper_mirror.png is the PBR mirror pass's copy of the default atlas.
    expect(
      files.filter((name) => !name.startsWith("camper_mirror")),
    ).toHaveLength(PAINTS.length);
    const khaki = readPng("textures/entity/yasu_ride/camper");
    expect([khaki.width, khaki.height]).toEqual([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]);
    for (const paint of PAINTS.slice(1)) {
      const texture = readPng(`textures/entity/yasu_ride/camper_${paint}`);
      expect([texture.width, texture.height]).toEqual([
        khaki.width,
        khaki.height,
      ]);
      expect(texture.pixels.equals(khaki.pixels), paint).toBe(false);
      for (let i = 0; i < khaki.width; i++) {
        // The PALETTE order in tools/gen_camper.py puts tan, khaki, and stripe
        // in slots 3, 4, and 6.
        if ([3, 4, 6].includes(i)) continue;
        expect(
          texture.pixels
            .subarray(i * 4, i * 4 + 4)
            .equals(khaki.pixels.subarray(i * 4, i * 4 + 4)),
          `${paint} slot ${i}`,
        ).toBe(true);
      }
      expect(
        texture.pixels
          .subarray(khaki.width * 4)
          .equals(khaki.pixels.subarray(khaki.width * 4)),
        paint,
      ).toBe(true);
    }
  });
});
