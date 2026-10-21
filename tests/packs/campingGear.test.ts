import { readdirSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

// tools/camping_gear.json is the one list of camping gear; these tests tie
// it to the generated block models, the atlas, the previews, and the docs
// (ADR 0093).
const RP = "packs/yasu_ride_rp";
const SPEC_PATH = "tools/camping_gear.json";
const MODELS = `${RP}/models/blocks/yasu_ride`;
const ATLAS = `${RP}/textures/blocks/yasu_ride/camping_gear.png`;
const PREVIEWS = "docs/images/items/camping-gear";
const PREVIEW_SIZE = 128;
const ATLAS_SIZE = 16;
const SWATCH = 4;
const GLASS_UV = [8, 12];
// The underside of the ceiling plate above the ceiling_hook slot, where a
// hanging item ends (HOOK_Y in tools/gen_camping_gear.py, ADR 0093).
const HOOK_Y = 29;
const MAX_STANDING_HEIGHT = 8;
const MAX_HANGING_HEIGHT = 10;

interface Gear {
  id: string;
  name_en: string;
  name_ja: string;
  width_px: number;
  height_px: number;
  places: string[];
  glass: boolean;
  hanging: boolean;
  reference: string | null;
}

const FACES = ["north", "south", "east", "west", "up", "down"] as const;
const AXES = [0, 1, 2] as const;

interface Cube {
  origin: [number, number, number];
  size: [number, number, number];
  rotation?: unknown;
  uv: Record<
    (typeof FACES)[number],
    { uv: [number, number]; uv_size: number[] }
  >;
}

const specText = readFileSync(SPEC_PATH, "utf8");
const SPEC = JSON.parse(specText) as Gear[];

// The furniture kinds that have decor slots (ADR 0093), with their names in the docs.
const PLACE_NAMES: Record<string, string> = {
  dashboard: "dashboard",
  table: "table",
  dinette_seat: "dinette seat",
  shelf: "shelf",
  stove: "stove",
  counter: "counter",
  ceiling_hook: "ceiling hook",
};

const geometryOf = (id: string) =>
  JSON.parse(readFileSync(`${MODELS}/${id}.geo.json`, "utf8"))[
    "minecraft:geometry"
  ][0] as {
    description: Record<string, unknown>;
    bones: { name: string; pivot: number[]; cubes: Cube[] }[];
  };

const cubesOf = (id: string) => geometryOf(id).bones.flatMap((b) => b.cubes);

const ySpan = (g: Gear) =>
  g.hanging ? [HOOK_Y - g.height_px, HOOK_Y] : [0, g.height_px];

function placesText(places: string[]): string {
  const text = places.map((p) => PLACE_NAMES[p] ?? p).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function docsRow(g: Gear): string {
  const reference =
    g.reference === null ? "None" : `[Reference](${g.reference})`;
  return `| ![${g.name_en}](../images/items/camping-gear/${g.id}.png) | ${g.name_en} | ${g.width_px} × ${g.height_px} | ${placesText(g.places)} | ${reference} |`;
}

// The generators write unfiltered 8-bit RGBA rows.
function readPng(path: string) {
  const png = readFileSync(path);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const length = png.readUInt32BE(pos);
    if (png.toString("ascii", pos + 4, pos + 8) === "IDAT") {
      idat.push(png.subarray(pos + 8, pos + 8 + length));
    }
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  expect(raw.length).toBe(height * (stride + 1));
  const pixel = (x: number, y: number) => {
    const start = y * (stride + 1) + 1 + x * 4;
    return [...raw.subarray(start, start + 4)];
  };
  return { width, height, pixel };
}

describe("camping gear spec (ADR 0093)", () => {
  it("lists the 19 items in the contract's order", () => {
    expect(SPEC.map((g) => g.id)).toEqual([
      "potted_plant",
      "macrame_planter",
      "cactus_pot",
      "percolator",
      "enamel_kettle",
      "saucepan",
      "mug_pair",
      "sugar_pot",
      "fruit_bowl",
      "toaster",
      "oil_lamp",
      "lava_lamp",
      "transistor_radio",
      "book_stack",
      "road_map",
      "photo_frame",
      "cushion",
      "tissue_box",
      "desk_fan",
    ]);
  });

  it("keeps the Japanese names as escapes so the file stays ASCII", () => {
    // pnpm lint:lang allows Japanese only in texts/*.lang (AGENTS.md)
    const codes = (text: string) =>
      [...text].map((ch) => ch.codePointAt(0) ?? 0);
    expect(codes(specText).every((c) => c < 0x80)).toBe(true);
    for (const g of SPEC)
      expect(
        codes(g.name_ja).some((c) => c >= 0x3040),
        g.id,
      ).toBe(true);
  });

  it.each(SPEC)(
    "$id: has a name, a size that fits its slot, and known places",
    (g) => {
      expect(g.name_en).toMatch(/^[A-Z][A-Za-z ]*[a-z]$/);
      expect(
        Number.isInteger(g.width_px) && g.width_px >= 1 && g.width_px <= 8,
      ).toBe(true);
      const maxHeight = g.hanging ? MAX_HANGING_HEIGHT : MAX_STANDING_HEIGHT;
      expect(
        Number.isInteger(g.height_px) &&
          g.height_px >= 1 &&
          g.height_px <= maxHeight,
      ).toBe(true);
      expect(g.places.length).toBeGreaterThan(0);
      expect(new Set(g.places).size).toBe(g.places.length);
      for (const p of g.places) expect(Object.keys(PLACE_NAMES)).toContain(p);
      expect(g.hanging).toBe(
        g.places.length === 1 && g.places[0] === "ceiling_hook",
      );
      expect(g.glass).toBe(g.id === "sugar_pot");
      expect(g.reference === null || /^https:\/\/\S+$/.test(g.reference)).toBe(
        true,
      );
    },
  );
});

describe("camping gear block models (ADR 0093)", () => {
  it("writes one model per item next to the deck floor and nothing else", () => {
    expect(readdirSync(MODELS).sort()).toEqual(
      ["deck_floor", ...SPEC.map((g) => g.id)]
        .map((n) => `${n}.geo.json`)
        .sort(),
    );
  });

  it.each(SPEC)(
    "$id: is centered in the cell, $width_px px wide and $height_px px high",
    (g) => {
      const geo = geometryOf(g.id);
      expect(geo.description).toEqual({
        identifier: `geometry.yasu_ride.${g.id}`,
        texture_width: ATLAS_SIZE,
        texture_height: ATLAS_SIZE,
      });
      expect(geo.bones.map((b) => [b.name, b.pivot])).toEqual([
        ["root", [0, 0, 0]],
      ]);
      const cubes = cubesOf(g.id);
      expect(cubes.length).toBeGreaterThan(0);
      const lo = AXES.map((i) => Math.min(...cubes.map((c) => c.origin[i])));
      const hi = AXES.map((i) =>
        Math.max(...cubes.map((c) => c.origin[i] + c.size[i])),
      );
      expect([lo[0], hi[0]]).toEqual([-g.width_px / 2, g.width_px / 2]);
      expect([lo[1], hi[1]]).toEqual(ySpan(g));
      expect(lo[2]).toBeGreaterThanOrEqual(-8);
      expect(hi[2]).toBeLessThanOrEqual(8);
      for (const c of cubes) {
        expect(c.rotation).toBeUndefined();
        expect(c.size.every((s) => s > 0)).toBe(true);
        expect(Object.keys(c.uv).sort()).toEqual([...FACES].sort());
        for (const f of FACES) {
          const [u, v] = c.uv[f].uv;
          expect(c.uv[f].uv_size).toEqual([SWATCH, SWATCH]);
          expect(u % SWATCH === 0 && v % SWATCH === 0).toBe(true);
          expect(u >= 0 && u < ATLAS_SIZE && v >= 0 && v < ATLAS_SIZE).toBe(
            true,
          );
        }
      }
    },
  );

  it.each(SPEC)(
    "$id: uses the glass swatch only when the spec says glass",
    (g) => {
      const usesGlass = cubesOf(g.id).some((c) =>
        FACES.some((f) => c.uv[f].uv.join() === GLASS_UV.join()),
      );
      expect(usesGlass).toBe(g.glass);
    },
  );

  it("paints the atlas as 16 distinct 4 by 4 swatches, opaque except the glass", () => {
    const { width, height, pixel } = readPng(ATLAS);
    expect([width, height]).toEqual([ATLAS_SIZE, ATLAS_SIZE]);
    const swatches = new Set<string>();
    for (let sy = 0; sy < ATLAS_SIZE; sy += SWATCH)
      for (let sx = 0; sx < ATLAS_SIZE; sx += SWATCH) {
        const color = pixel(sx, sy);
        for (let y = sy; y < sy + SWATCH; y++)
          for (let x = sx; x < sx + SWATCH; x++)
            expect(pixel(x, y)).toEqual(color);
        const glass = sx === GLASS_UV[0] && sy === GLASS_UV[1];
        expect((color[3] ?? 0) < 255, `${sx},${sy}`).toBe(glass);
        swatches.add(color.join());
      }
    expect(swatches.size).toBe((ATLAS_SIZE / SWATCH) ** 2);
  });

  it("registers the atlas as the terrain texture yasu_ride_camping_gear", () => {
    expect(
      JSON.parse(readFileSync(`${RP}/textures/terrain_texture.json`, "utf8")),
    ).toEqual({
      resource_pack_name: "yasu_ride",
      texture_name: "atlas.terrain",
      texture_data: {
        yasu_ride_camping_gear: {
          textures: "textures/blocks/yasu_ride/camping_gear",
        },
      },
    });
  });
});

describe("camping gear docs (ADR 0093)", () => {
  it("renders a 128 px RGBA preview for every item and no other", () => {
    expect(readdirSync(PREVIEWS).sort()).toEqual(
      SPEC.map((g) => `${g.id}.png`).sort(),
    );
    for (const g of SPEC) {
      const { width, height } = readPng(`${PREVIEWS}/${g.id}.png`);
      expect([width, height], g.id).toEqual([PREVIEW_SIZE, PREVIEW_SIZE]);
    }
  });

  it("lists every item in spec order on the camping gear page", () => {
    const rows = readFileSync("docs/items/camping-gear.md", "utf8")
      .split("\n")
      .filter((line) => line.startsWith("| !["));
    expect(rows).toEqual(SPEC.map(docsRow));
  });

  it("counts the camping gear on the item groups page", () => {
    const lines = readFileSync("docs/items/README.md", "utf8").split("\n");
    expect(lines).toContain(
      `| **Camping Gear** | ${SPEC.length} | [Previews and places](camping-gear.md) |`,
    );
  });

  it("links the item groups page from the README right after the vehicles", () => {
    const readme = readFileSync("README.md", "utf8");
    const headings = readme.split("\n").filter((l) => l.startsWith("## "));
    expect(headings.indexOf("## Items")).toBe(
      headings.indexOf("## Vehicles") + 1,
    );
    const section = readme.slice(
      readme.indexOf("## Items"),
      readme.indexOf("\n## ", readme.indexOf("## Items") + 1),
    );
    expect(section).toContain("](docs/items/README.md)");
  });
});
