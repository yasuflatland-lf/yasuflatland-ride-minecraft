import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import { readRgbaPng } from "./png";

const RP = "packs/yasu_ride_rp";

export function readTextureMer(path: string) {
  const setPath = `${path}.texture_set.json`;
  if (!existsSync(setPath)) return undefined;
  const set = JSON.parse(readFileSync(setPath, "utf8"))[
    "minecraft:texture_set"
  ] as { metalness_emissive_roughness: string | [number, number, number] };
  const mer = set.metalness_emissive_roughness;
  return typeof mer === "string"
    ? readRgbaPng(join(dirname(path), `${mer}.png`))
    : mer;
}

export function expectUniqueTextureBindings(textures: Record<string, string>) {
  const contents = new Map<string, string>();
  for (const path of new Set(Object.values(textures))) {
    const fullPath = `${RP}/${path}`;
    expect(existsSync(`${fullPath}.png`), path).toBe(true);
    const color = readRgbaPng(`${fullPath}.png`);
    const mer = readTextureMer(fullPath);
    const content = JSON.stringify([
      color.width,
      color.height,
      color.pixels.toString("hex"),
      mer && !Array.isArray(mer)
        ? [mer.width, mer.height, mer.pixels.toString("hex")]
        : mer,
    ]);
    expect(
      contents.get(content),
      `Duplicate texture content: ${path}`,
    ).toBeUndefined();
    contents.set(content, path);
  }
}
