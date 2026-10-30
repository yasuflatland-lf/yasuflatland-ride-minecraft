import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { readRgbaPng } from "../support/png";

const directory = "packs/yasu_ride_rp/textures/entity/yasu_ride";
const names: string[] = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      "import json, sys\nsys.path.insert(0, 'tools')\nfrom tool_loader import load_tool\nprint(json.dumps(load_tool('suv_palette').NAMES))",
    ],
    { encoding: "utf8" },
  ),
);
const nameFor = (paint: string) => (paint === "khaki" ? "suv" : `suv_${paint}`);
const merFor = (paint: string) =>
  readRgbaPng(`${directory}/${nameFor(paint)}_mer.png`);
const swatchX = (name: string) => {
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`Missing palette swatch: ${name}`);
  return index * 4;
};
const swatch = (mer: ReturnType<typeof merFor>, name: string) => {
  const offset = (mer.width + swatchX(name) + 1) * 4;
  return [...mer.pixels.subarray(offset, offset + 4)];
};

describe("SUV paint texture sets", () => {
  it.each(PAINTS)("%s has the exact texture set", (paint) => {
    const name = nameFor(paint);
    expect(
      JSON.parse(readFileSync(`${directory}/${name}.texture_set.json`, "utf8")),
    ).toEqual({
      format_version: "1.16.100",
      "minecraft:texture_set": {
        color: name,
        metalness_emissive_roughness: `${name}_mer`,
      },
    });
  });

  it.each(PAINTS)("%s MER matches the colour size", (paint) => {
    const color = readRgbaPng(`${directory}/${nameFor(paint)}.png`);
    const mer = merFor(paint);
    expect([mer.width, mer.height]).toEqual([color.width, color.height]);
  });

  it.each(PAINTS)(
    "%s has painted steel and matte hardtop swatches",
    (paint) => {
      const mer = merFor(paint);
      expect(swatch(mer, "body")).toEqual([110, 0, 60, 255]);
      for (const name of ["hardtop", "hardtop_rib"])
        expect(swatch(mer, name), name).toEqual([0, 0, 220, 255]);
    },
  );

  it.each(PAINTS)("%s glow swatch has emissive 215", (paint) => {
    expect(swatch(merFor(paint), "glow")[1]).toBe(215);
  });

  it.each(PAINTS)("%s lamp swatches have emissive 0", (paint) => {
    const mer = merFor(paint);
    for (const name of ["light", "tail", "amber"])
      expect(swatch(mer, name)[1], name).toBe(0);
  });

  it.each(PAINTS)(
    "%s has no emissive texels outside the glow cell",
    (paint) => {
      const mer = merFor(paint);
      const glowX = swatchX("glow");
      const offending: [number, number][] = [];
      for (let y = 0; y < mer.height && offending.length < 10; y++) {
        for (let x = 0; x < mer.width && offending.length < 10; x++) {
          if (y < 4 && x >= glowX && x < glowX + 4) continue;
          if (mer.pixels[(y * mer.width + x) * 4 + 1] !== 0)
            offending.push([x, y]);
        }
      }
      expect(offending).toEqual([]);
    },
  );
});
