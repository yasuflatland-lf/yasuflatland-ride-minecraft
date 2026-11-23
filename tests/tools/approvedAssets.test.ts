import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";

it("preserves approved texture regions and the recorded scooter idle clip", async () => {
  const { hashes, tiles } = JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `
import hashlib, json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
kit = load_tool('camper_kit')
surfaces = load_tool('camper_surfaces')
fronts = load_tool('camper_kitchen_fronts')
tiles = load_tool('tile_layout').TILE_RECTS
layout = kit.LAYOUT

def digest(pixels):
    return hashlib.sha256(bytes(c for pixel in pixels for c in pixel)).hexdigest()

def digest_region(region):
    return digest(region.pixel(x,y) for y in range(region.height) for x in range(region.width))

regions = {r.name: digest_region(r) for r in kit.REGISTRY.regions() if r.name != 'base'}
shower = {name: regions.pop(name) for name in list(regions) if name.startswith('shower ')}
regions.pop('routed cream panel')
width, height = surfaces.WALL_SIZE
rail_rows = [row for row in range(height)
             if any(abs(surfaces.WALL_TOP-(row+0.5)/surfaces.WALL_SCALE-rail) < 0.5
                    for rail in surfaces.WALL_RAILS)]
print(json.dumps({
    'hashes': {
        'camper atlas regions': regions,
        'camper shower atlas regions': shower,
        'camper routed cream panel source': digest(fronts.panel_pixels()),
        'camper wall veneer rails': digest(surfaces.wall_pixel(x,row) for row in rail_rows for x in range(width)),
    },
    'tiles': {name: tiles[name] for name in ('quilt', 'mirror')},
}))
`,
      ],
      { encoding: "utf8" },
    ),
  ) as {
    hashes: Record<string, string | Record<string, string>>;
    tiles: Record<string, [[number, number], [number, number]]>;
  };

  const atlas = readRgbaPng(`${RP}/textures/entity/yasu_ride/sportsboat.png`);
  const tileHashes: Record<string, string> = {};
  for (const [name, [[u, v], [width, height]]] of Object.entries(tiles)) {
    const hash = createHash("sha256");
    for (let y = v; y < v + height; y++) {
      const offset = (y * atlas.width + u) * 4;
      hash.update(atlas.pixels.subarray(offset, offset + width * 4));
    }
    tileHashes[name] = hash.digest("hex");
  }
  hashes["sportsboat.png tiles"] = tileHashes;

  hashes["scooter_engine_0.ogg"] = createHash("sha256")
    .update(readFileSync(`${RP}/sounds/yasu_ride/scooter_engine_0.ogg`))
    .digest("hex");

  // Refresh after approval with pnpm exec vitest run tests/tools/approvedAssets.test.ts --update.
  const keys = [
    ...new Set(
      Object.entries(hashes).flatMap(([name, value]) =>
        typeof value === "string" ? [name] : [name, ...Object.keys(value)],
      ),
    ),
  ].sort();
  await expect(`${JSON.stringify(hashes, keys, 2)}\n`).toMatchFileSnapshot(
    "./fixtures/approved-asset-hashes.json",
  );
});
