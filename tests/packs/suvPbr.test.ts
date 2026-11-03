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
type Png = ReturnType<typeof readRgbaPng>;

function nameFor(paint: string): string {
  return paint === "khaki" ? "suv" : `suv_${paint}`;
}

function merFor(paint: string): Png {
  return readRgbaPng(`${directory}/${nameFor(paint)}_mer.png`);
}

function swatchX(name: string): number {
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`Missing palette swatch: ${name}`);
  return index * 4;
}

// Samples (1, 1) inside the 4-texel cell, past the swatch inset.
function swatch(mer: Png, name: string): number[] {
  const offset = (mer.width + swatchX(name) + 1) * 4;
  return [...mer.pixels.subarray(offset, offset + 4)];
}

function textureSet(name: string): Record<string, string> {
  return JSON.parse(
    readFileSync(`${directory}/${name}.texture_set.json`, "utf8"),
  )["minecraft:texture_set"];
}

const reliefKeys = ["heightmap", "normal"];
const khakiSet = textureSet("suv");
const reliefKind = reliefKeys.find((key) => key in khakiSet) ?? "heightmap";
const reliefName = khakiSet[reliefKind];

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
        [reliefKind]: reliefName,
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

describe("SUV relief map", () => {
  it("shares exactly one relief map across all sixteen paints and excludes the lit pass", () => {
    expect(PAINTS).toHaveLength(16);
    expect(reliefName).toBe(`suv_${reliefKind}`);
    for (const paint of PAINTS) {
      const set = textureSet(nameFor(paint));
      expect(reliefKeys.filter((key) => key in set)).toEqual([reliefKind]);
      expect(set[reliefKind]).toBe(reliefName);
    }
    expect(reliefKeys.filter((key) => key in textureSet("suv_lit"))).toEqual(
      [],
    );
  });

  it("matches the colour size and stays flat, since no painted region carries relief", () => {
    const map = readRgbaPng(`${directory}/${reliefName}.png`);
    const color = readRgbaPng(`${directory}/suv.png`);
    expect([map.width, map.height]).toEqual([color.width, color.height]);
    const flat =
      reliefKind === "heightmap" ? [128, 128, 128, 255] : [128, 128, 255, 255];
    const invalid: [number, number][] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const offset = (y * map.width + x) * 4;
        if (
          flat.some((value, c) => map.pixels[offset + c] !== value) &&
          invalid.length < 10
        )
          invalid.push([x, y]);
      }
    }
    expect(invalid).toEqual([]);
  });
});
