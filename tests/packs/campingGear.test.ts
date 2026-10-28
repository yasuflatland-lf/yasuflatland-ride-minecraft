import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward } from "../../src/domain/shared/vec";
import { DECOR_SLOTS } from "../../src/domain/vehicle/kinds/camper/decor";
import { DECOR_SPOTS } from "../../src/domain/vehicle/kinds/camper/furniture";
import { decorSpotOffset } from "../../src/domain/vehicle/kinds/camper/room";
import {
  CAMPING_GEAR_IDS,
  STANDING_GEAR_IDS,
} from "../../src/domain/vehicle/kinds/index";
import {
  CAMPER_CABINET_COMPONENT,
  CAMPER_DECOR_COMPONENT,
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
  PAIR_END_STATES,
  PAIR_PAGE_SIZE,
  pairDecorBlockId,
  pairEndStates,
  pairHeightStates,
  ROOM_OPEN_STATE,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { defined } from "../support/defined";

// tools/camping_gear.json is the one list of camping gear; these tests tie
// it to the generated block models, the atlas, the previews, and the docs
// (ADR 0093).
const RP = "packs/yasu_ride_rp";
const BP = "packs/yasu_ride_bp";
const SPEC_PATH = "tools/camping_gear.json";
const MODELS = `${RP}/models/blocks/yasu_ride`;
const ATLAS = `${RP}/textures/blocks/yasu_ride/camping_gear.png`;
const PREVIEWS = "docs/images/items/camping-gear";
const PREVIEW_SIZE = 128;
const ATLAS_SIZE = 16;
const SWATCH = 4;
const GLASS_UV = [8, 12];
const MAX_STANDING_HEIGHT = 8;
const MAX_HANGING_HEIGHT = 10;

interface Gear {
  id: string;
  name_en: string;
  name_ja: string;
  width_px: number;
  height_px: number;
  glass: boolean;
  hanging: boolean;
  reference: string | null;
}

const FACES = ["north", "south", "east", "west", "up", "down"] as const;
const AXES = [0, 1, 2] as const;

interface Cube {
  origin: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  pivot?: [number, number, number];
  uv: Record<
    (typeof FACES)[number],
    { uv: [number, number]; uv_size: number[] }
  >;
}

const specText = readFileSync(SPEC_PATH, "utf8");
const SPEC = JSON.parse(specText) as Gear[];

const geometryOf = (id: string) =>
  JSON.parse(readFileSync(`${MODELS}/${id}.geo.json`, "utf8"))[
    "minecraft:geometry"
  ][0] as {
    description: Record<string, unknown>;
    bones: { name: string; pivot: number[]; cubes: Cube[] }[];
  };

const cubesOf = (id: string) => geometryOf(id).bones.flatMap((b) => b.cubes);

function cubeCorners(cube: Cube): [number, number, number][] {
  const pivot = cube.pivot ?? [0, 0, 0];
  const [rx, ry, rz] = cube.rotation ?? [0, 0, 0];
  return Array.from({ length: 8 }, (_, n) => {
    let [x, y, z] = AXES.map(
      (i) => cube.origin[i] + cube.size[i] * ((n >> i) & 1) - pivot[i],
    ) as [number, number, number];
    // Bedrock's X and Z turns have the opposite sign to mathematical rotations (ADR 0051).
    for (const [axis, degrees] of [-rx, ry, -rz].entries()) {
      const r = (degrees * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
      if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
      if (axis === 2) [x, y] = [x * c - y * s, x * s + y * c];
    }
    return [x + pivot[0], y + pivot[1], z + pivot[2]];
  });
}

const ySpan = (g: Gear): [number, number] => [0, g.height_px];

// A standing item goes on any spot but the ceiling hook, which takes only a hanging one (ADR 0097).
const placementText = (g: Gear) =>
  g.hanging ? "Hangs from the ceiling hook" : "Stands";

function docsRow(g: Gear): string {
  const reference =
    g.reference === null ? "None" : `[Reference](${g.reference})`;
  return `| ![${g.name_en}](../images/items/camping-gear/${g.id}.png) | ${g.name_en} | ${g.width_px} × ${g.height_px} | ${placementText(g)} | ${reference} |`;
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
  it("lists the 17 items in the contract's order", () => {
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
    "$id: has a name, a size that fits its slot, and says whether it hangs",
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
      expect(g).not.toHaveProperty("places");
      expect(g.hanging).toBe(g.id === "macrame_planter");
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
      [
        "deck_floor",
        "cabinet_decor_pair",
        "fridge_decor_pair",
        "shelf_decor_pair",
        "table_decor_pair",
        ...SPEC.map((g) => g.id),
      ]
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
      const points = cubes.flatMap(cubeCorners);
      const lo = AXES.map((i) => Math.min(...points.map((p) => p[i])));
      const hi = AXES.map((i) => Math.max(...points.map((p) => p[i])));
      expect(lo[0]).toBeCloseTo(-g.width_px / 2, 3);
      expect(hi[0]).toBeCloseTo(g.width_px / 2, 3);
      expect([lo[1], hi[1]]).toEqual(ySpan(g));
      expect(lo[2]).toBeGreaterThanOrEqual(-8);
      expect(hi[2]).toBeLessThanOrEqual(8);
      for (const c of cubes) {
        expect(
          (c.rotation ?? []).filter((v) => v !== 0).length,
        ).toBeLessThanOrEqual(1);
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
    "$id: stays inside its cell, 0 to 16 px high (ADR 0099)",
    (g) => {
      const cubes = cubesOf(g.id);
      for (const point of cubes.flatMap(cubeCorners)) {
        expect(point[0], g.id).toBeGreaterThanOrEqual(-8);
        expect(point[0], g.id).toBeLessThanOrEqual(8);
        expect(point[1], g.id).toBeGreaterThanOrEqual(0);
        expect(point[1], g.id).toBeLessThanOrEqual(16);
        expect(point[2], g.id).toBeGreaterThanOrEqual(-8);
        expect(point[2], g.id).toBeLessThanOrEqual(8);
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

  it("keeps the pair geometries within their cell and size budget (ADR 0169)", () => {
    for (const kind of ["shelf", "table", "cabinet", "fridge"]) {
      expect(
        statSync(`${MODELS}/${kind}_decor_pair.geo.json`).size,
      ).toBeLessThan(1_000_000);
      for (const bone of geometryOf(`${kind}_decor_pair`).bones) {
        for (const p of bone.cubes.flatMap(cubeCorners)) {
          expect(Math.abs(p[0])).toBeLessThanOrEqual(8);
          expect(Math.abs(p[2])).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it.each(["oil_lamp", "lantern"])(
    "removes the %s decor assets, atlas key, and names",
    (id) => {
      for (const path of [
        `${BP}/items/yasu_ride/${id}.item.json`,
        `${BP}/blocks/yasu_ride/${id}_decor.block.json`,
        `${MODELS}/${id}.geo.json`,
        `${RP}/textures/items/yasu_ride/${id}.png`,
        `${PREVIEWS}/${id}.png`,
      ])
        expect(existsSync(path), path).toBe(false);
      expect(
        readFileSync(`${RP}/textures/item_texture.json`, "utf8"),
      ).not.toContain(`yasu_ride_${id}`);
      for (const locale of ["en_US", "ja_JP"]) {
        const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
        expect(lang).not.toContain(`item.yasu_ride:${id}.name`);
        expect(lang).not.toContain(`tile.yasu_ride:${id}_decor.name`);
      }
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
  it("renders a 128 px RGBA preview for every item and the low chair and tent, and no other", () => {
    // The low chair and tent share the folder but are not decor (ADR 0122, 0130)
    expect(readdirSync(PREVIEWS).sort()).toEqual(
      [
        ...SPEC.map((g) => `${g.id}.png`),
        "low_chair.png",
        "noga_chair.png",
        "tent.png",
        "camp_table.png",
        "fire_pit.png",
        "dutch_oven.png",
        "gas_lantern.png",
      ].sort(),
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
      `| **Camping Gear (Inside)** | ${SPEC.length} | [Previews and placement](camping-gear.md) |`,
    );
  });

  it("counts the outside gear on the item groups page", () => {
    expect(readFileSync("docs/items/README.md", "utf8")).toContain(
      "| **Camping Gear (Outside)** | 7 | [Low Chair, Noga Chair, Tent, Camp Table, Fire Pit, Dutch Oven, and Gas Lantern](camping-gear.md#low-chair-outside-the-vehicles) |",
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

// The decor block states and their rotations, kept in tools/gen_camping_gear.py (ADR 0093)
const FACE_ROTATION = [180, 90, 0, -90];
const HEIGHTS = Array.from({ length: 16 }, (_, h) => h);
const ATLAS_KEY = "yasu_ride_camping_gear";
// "Camping Gear" in Japanese, escaped so that pnpm lint:lang passes on this file
const JA_GROUP_NAME = "\u30ad\u30e3\u30f3\u30d4\u30f3\u30b0\u7528\u54c1";

interface Permutation {
  condition: string;
  components: {
    "minecraft:transformation": { rotation: number[]; translation: number[] };
  };
}

interface DecorBlock {
  "minecraft:block": {
    components: Record<string, unknown> & {
      "minecraft:material_instances": Record<string, { texture: string }>;
    };
    permutations: Permutation[];
  };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const PAIR_KINDS = ["shelf", "table"] as const;
// No slot lays the shelf's pair block since the fridge took the shelf's place, but it keeps
// its board heights, so a block an older build laid keeps its type (ADR 0108, 0123).
const RETIRED_PAIR_HEIGHTS: Partial<
  Record<(typeof PAIR_KINDS)[number], number[]>
> = { shelf: [4, 10] };
interface PairBlock {
  "minecraft:block": {
    description: { states: Record<string, number[]> };
    components: Record<string, unknown> & {
      "minecraft:geometry": {
        identifier: string;
        bone_visibility: Record<string, string>;
      };
    };
    permutations: unknown[];
  };
}
const pairOf = (kind: string) =>
  readJson(`${BP}/blocks/yasu_ride/${kind}_decor_pair.block.json`) as PairBlock;
// Evaluates the generated bone_visibility form, "q.block_state('<state>') == <n>" joined by &&;
// the cabinet's door state compares with true (ADR 0114).
function molangTrue(
  expr: string,
  states: Record<string, number | boolean>,
): boolean {
  return expr.split(" && ").every((term) => {
    const m = /^q\.block_state\('([^']+)'\) == (\d+|true)$/.exec(term);
    if (!m) throw new Error(`unexpected bone_visibility term: ${term}`);
    const want = m[2] === "true" ? true : Number(m[2]);
    return states[m[1] ?? ""] === want;
  });
}
const decorPath = (g: Gear) =>
  `${BP}/blocks/yasu_ride/${g.id}_decor.block.json`;
const decorOf = (g: Gear) => readJson(decorPath(g)) as DecorBlock;
const condition = (face: number, spot: number, height: number) =>
  `q.block_state('yasu_ride:face') == ${face} && q.block_state('yasu_ride:spot') == ${spot} && q.block_state('yasu_ride:height') == ${height}`;
// The spots of the slots a decor block stands on, and ADR 0107's burner spots; a shelf board's
// or the table's ends are drawn by its pair block instead (ADR 0107, 0108, 0112).
const SPOTS = DECOR_SPOTS.map((_, spot) => spot).filter(
  (spot) => !DECOR_SLOTS.some((s) => s.pair && s.spot === spot),
);
// The burner height of ADR 0107's four stove spots, which no slot uses since ADR 0112.
const RETIRED_BURNER_HEIGHTS = [15];
// The middle spot takes every height; another spot only the heights of the slots on it, or
// the burner height when no slot uses it (ADR 0107, 0112).
const spotHeights = (spot: number) => {
  if (spot === 0) return HEIGHTS;
  const used = [
    ...new Set(DECOR_SLOTS.filter((s) => s.spot === spot).map((s) => s.height)),
  ].sort((a, b) => a - b);
  return used.length > 0 ? used : RETIRED_BURNER_HEIGHTS;
};
const translation = (face: number, spot: number, height: number) => {
  const { x, z } = decorSpotOffset(90 * face, spot);
  return [x, height / 16, z];
};

// A standing item's box spans the cell from its base to its top, at least 1 px; a hanging
// item's stays at its footprint (ADR 0097, 0105).
function selectionBox(g: Gear) {
  const [y0, y1] = ySpan(g);
  if (g.hanging) {
    const w = g.width_px;
    return { origin: [-w / 2, y0, -w / 2], size: [w, y1 - y0, w] };
  }
  return { origin: [-8, y0, -8], size: [16, Math.max(1, y1 - y0), 16] };
}

function expectedDecor(g: Gear) {
  return {
    format_version: "1.21.80",
    "minecraft:block": {
      description: {
        identifier: decorBlockId(g.id),
        menu_category: { category: "none" },
        states: {
          [DECOR_FACE_STATE]: [0, 1, 2, 3],
          [DECOR_HEIGHT_STATE]: HEIGHTS,
          [DECOR_SPOT_STATE]: SPOTS,
        },
      },
      components: {
        "minecraft:geometry": `geometry.yasu_ride.${g.id}`,
        "minecraft:material_instances": {
          "*": {
            texture: ATLAS_KEY,
            render_method: g.glass ? "blend" : "opaque",
          },
        },
        "minecraft:light_dampening": 0,
        "minecraft:destructible_by_mining": false,
        "minecraft:destructible_by_explosion": false,
        "tag:yasu_ride:laid": {},
        "minecraft:custom_components": [CAMPER_DECOR_COMPONENT],
        "minecraft:collision_box": false,
        "minecraft:selection_box": selectionBox(g),
      },
      permutations: [0, 1, 2, 3].flatMap((face) =>
        SPOTS.flatMap((spot) =>
          spotHeights(spot).map((height) => ({
            condition: condition(face, spot, height),
            components: {
              "minecraft:transformation": {
                rotation: [0, FACE_ROTATION[face], 0],
                translation: translation(face, spot, height),
              },
            },
          })),
        ),
      ),
    },
  };
}

function langValues(locale: string): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (const line of readFileSync(`${RP}/texts/${locale}.lang`, "utf8").split(
    "\n",
  )) {
    const at = line.indexOf("=");
    if (at < 0 || line.startsWith("#")) continue;
    const key = line.slice(0, at);
    values.set(key, [...(values.get(key) ?? []), line.slice(at + 1)]);
  }
  return values;
}

describe("camping gear blocks and items (ADR 0093)", () => {
  it("defines one decor block per gear with no collision, a selection box over its cell or its hanging model, and the decor component (ADR 0093, 0102, 0105)", () => {
    for (const g of SPEC) {
      const block = decorOf(g);
      expect(block, g.id).toEqual(expectedDecor(g));
      const components = block["minecraft:block"].components;
      expect(components).not.toHaveProperty(["minecraft:loot"]);
      expect(components).not.toHaveProperty(["minecraft:transformation"]);
    }
    expect(
      readdirSync(`${BP}/blocks/yasu_ride`)
        .filter((f) => f.endsWith("_decor.block.json"))
        .sort(),
    ).toEqual(SPEC.map((g) => `${g.id}_decor.block.json`).sort());
  });

  it("starts the macrame planter at its cell bottom, with its outline over it (ADR 0102)", () => {
    const planter = SPEC.find((g) => g.id === "macrame_planter");
    if (planter === undefined) throw new Error("macrame_planter is missing");
    const cubes = cubesOf(planter.id);
    const bottom = Math.min(...cubes.map((c) => c.origin[1]));
    const top = Math.max(...cubes.map((c) => c.origin[1] + c.size[1]));
    expect([bottom, top]).toEqual([0, 10]);
    expect(
      decorOf(planter)["minecraft:block"].components["minecraft:selection_box"],
    ).toEqual({ origin: [-2.5, 0, -2.5], size: [5, 10, 5] });
  });

  it("lifts every hanging item to the top of the hook cell (ADR 0102)", () => {
    const hanging = DECOR_SLOTS.filter((s) => s.hanging === true);
    expect(hanging.map((s) => s.id)).toEqual(["ceiling_hook"]);
    const [hook] = hanging;
    if (hook === undefined) throw new Error("no hanging slot");
    const items = SPEC.filter((g) => g.hanging);
    expect(items.length).toBeGreaterThan(0);
    for (const g of items) expect(hook.height + g.height_px, g.id).toBe(16);
  });

  it("registers the decor component on every camping gear block (ADR 0093)", () => {
    for (const g of SPEC)
      expect(
        decorOf(g)["minecraft:block"].components["minecraft:custom_components"],
        g.id,
      ).toEqual([CAMPER_DECOR_COMPONENT]);
  });

  it("turns the gear model's -z to the camper's front for every face", () => {
    const blocks = new Map(SPEC.map((g) => [g.id, decorOf(g)]));
    fc.assert(
      fc.property(
        fc.constantFrom(...SPEC),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 15 }),
        (g, face, height) => {
          const matches =
            blocks
              .get(g.id)
              ?.["minecraft:block"].permutations.filter(
                (p) => p.condition === condition(face, 0, height),
              ) ?? [];
          expect(matches).toHaveLength(1);
          const turn = matches[0]?.components["minecraft:transformation"];
          expect(turn?.translation).toEqual([0, height / 16, 0]);
          const rad = ((turn?.rotation[1] ?? Number.NaN) * Math.PI) / 180;
          // Bedrock's block turn: +90 takes north (model -z) to west
          const front = {
            x: Math.round(-Math.sin(rad)) + 0,
            z: Math.round(-Math.cos(rad)) + 0,
          };
          const camper = forward(90 * face);
          expect(front).toEqual({
            x: Math.round(camper.x) + 0,
            z: Math.round(camper.z) + 0,
          });
        },
      ),
    );
  });

  it("draws every slot's item at its spot for every face, moved by the domain's spot offset (ADR 0107)", () => {
    const blocks = SPEC.map(decorOf);
    expect(SPOTS).toEqual([0, 1, 2, 3, 4]);
    for (const slot of DECOR_SLOTS.filter((s) => !s.pair))
      for (const face of [0, 1, 2, 3])
        for (const block of blocks) {
          const spot = slot.spot ?? 0;
          const matches = block["minecraft:block"].permutations.filter(
            (p) => p.condition === condition(face, spot, slot.height),
          );
          expect(matches, slot.id).toHaveLength(1);
          expect(
            matches[0]?.components["minecraft:transformation"].translation,
          ).toEqual(translation(face, spot, slot.height));
        }
    // Face 0 is yaw 0: the camper faces +z, so its left is +x (ADR 0107).
    expect(translation(0, 1, 15)).toEqual([3.8 / 16, 15 / 16, 5.4 / 16]);
  });

  it("covers the whole cell with a standing item's selection box and only the footprint with a hanging item's (ADR 0097, 0105)", () => {
    for (const g of SPEC) {
      const box = decorOf(g)["minecraft:block"].components[
        "minecraft:selection_box"
      ] as { origin: number[]; size: number[] };
      const [x0 = 0, y0 = 0, z0 = 0] = box.origin;
      const [sx = 0, sy = 0, sz = 0] = box.size;
      expect(y0, g.id).toBe(0);
      expect(sy, g.id).toBeGreaterThanOrEqual(1);
      expect(sy, g.id).toBeGreaterThanOrEqual(g.height_px);
      if (g.hanging) {
        expect([x0, z0, sx, sz], g.id).toEqual([
          -g.width_px / 2,
          -g.width_px / 2,
          g.width_px,
          g.width_px,
        ]);
      } else {
        expect([x0, z0, sx, sz], g.id).toEqual([-8, -8, 16, 16]);
      }
    }
  });

  it("defines a pair block for each two-item furniture: face, the heights of its slots when there are two or more, and each end's item as a page and an item state, all within 2 to 16 values (ADR 0108)", () => {
    const standing = SPEC.filter((g) => !g.hanging);
    for (const kind of PAIR_KINDS) {
      const block = pairOf(kind)["minecraft:block"];
      const slots = DECOR_SLOTS.filter((s) => s.pair?.kind === kind);
      const heights =
        RETIRED_PAIR_HEIGHTS[kind] ??
        [...new Set(slots.map((s) => s.height))].sort((a, b) => a - b);
      expect(slots.length === 0).toBe(kind in RETIRED_PAIR_HEIGHTS);
      const pages = Math.ceil((standing.length + 1) / PAIR_PAGE_SIZE);
      const range = (n: number) => Array.from({ length: n }, (_, i) => i);
      const [end0, end1] = PAIR_END_STATES;
      // BDS rejects an enum state with one value, so the table's one height is not a state.
      const lifted = heights.length > 1;
      expect(lifted).toBe(kind === "shelf");
      expect(block.description).toEqual({
        identifier: pairDecorBlockId(kind),
        menu_category: { category: "none" },
        states: {
          [DECOR_FACE_STATE]: [0, 1, 2, 3],
          ...(lifted ? { [DECOR_HEIGHT_STATE]: heights } : {}),
          [end0.item]: range(PAIR_PAGE_SIZE),
          [end0.page]: range(pages),
          [end1.item]: range(PAIR_PAGE_SIZE),
          [end1.page]: range(pages),
        },
      });
      // The scripts set the height state exactly when the block defines it.
      for (const height of slots.length > 0 ? heights : [])
        expect(pairHeightStates(kind, height)).toEqual(
          lifted ? { [DECOR_HEIGHT_STATE]: height } : {},
        );
      for (const values of Object.values(block.description.states)) {
        expect(values.length).toBeGreaterThanOrEqual(2);
        expect(values.length).toBeLessThanOrEqual(16);
      }
      const c = block.components;
      expect(c["minecraft:collision_box"]).toBe(false);
      expect(c["minecraft:custom_components"]).toEqual([
        CAMPER_DECOR_COMPONENT,
      ]);
      expect(c["minecraft:destructible_by_mining"]).toBe(false);
      expect(c["minecraft:selection_box"]).toEqual({
        origin: [-8, 0, -8],
        size: [16, MAX_STANDING_HEIGHT, 16],
      });
      // BDS rejects a block that mixes opaque and blending material instances.
      expect(c["minecraft:material_instances"]).toEqual({
        "*": { texture: ATLAS_KEY, render_method: "opaque" },
      });
      expect(c).not.toHaveProperty(["minecraft:transformation"]);
      // Only turned by the face and lifted by the height: the items stay over the cell.
      expect(block.permutations).toEqual(
        [0, 1, 2, 3].flatMap((face) =>
          heights.map((height) => ({
            condition: lifted
              ? `q.block_state('yasu_ride:face') == ${face} && q.block_state('yasu_ride:height') == ${height}`
              : `q.block_state('yasu_ride:face') == ${face}`,
            components: {
              "minecraft:transformation": {
                rotation: [0, FACE_ROTATION[face], 0],
                translation: [0, height / 16, 0],
              },
            },
          })),
        ),
      );
    }
    expect(
      readdirSync(`${BP}/blocks/yasu_ride`)
        .filter((f) => f.endsWith("_decor_pair.block.json"))
        .sort(),
    ).toEqual(
      [...PAIR_KINDS, "cabinet", "fridge"]
        .map((k) => `${k}_decor_pair.block.json`)
        .sort(),
    );
  });

  it("defines the wall cabinet's compartment block as a pair block with a door state, its own component, the ceiling's collision, and a box over the compartment, all lifted onto the compartment floor (ADR 0114)", () => {
    const standing = SPEC.filter((g) => !g.hanging);
    const block = pairOf("cabinet")["minecraft:block"];
    const pages = Math.ceil((standing.length + 1) / PAIR_PAGE_SIZE);
    const range = (n: number) => Array.from({ length: n }, (_, i) => i);
    const [end0, end1] = PAIR_END_STATES;
    const heights = [
      ...new Set(
        DECOR_SLOTS.filter((s) => s.pair?.kind === "cabinet").map(
          (s) => s.height,
        ),
      ),
    ];
    expect(heights).toEqual([3]);
    const lift = heights[0] ?? Number.NaN;
    expect(pairHeightStates("cabinet", lift)).toEqual({});
    expect(block.description).toEqual({
      identifier: pairDecorBlockId("cabinet"),
      menu_category: { category: "none" },
      states: {
        [DECOR_FACE_STATE]: [0, 1, 2, 3],
        [ROOM_OPEN_STATE]: [false, true],
        [end0.item]: range(PAIR_PAGE_SIZE),
        [end0.page]: range(pages),
        [end1.item]: range(PAIR_PAGE_SIZE),
        [end1.page]: range(pages),
      },
    });
    const c = block.components;
    expect(c["minecraft:custom_components"]).toEqual([
      CAMPER_CABINET_COMPONENT,
    ]);
    // Lifted by 3 px, the collision is the ceiling plate's top 3 px of the cell and the box
    // runs from the compartment floor to the top of the doors, over the tallest item.
    expect(c["minecraft:collision_box"]).toEqual({
      origin: [-8, 16 - 3 - lift, -8],
      size: [16, 3, 16],
    });
    expect(c["minecraft:selection_box"]).toEqual({
      origin: [-8, 0, -8],
      size: [16, 10, 16],
    });
    expect(MAX_STANDING_HEIGHT).toBeLessThanOrEqual(10);
    expect(c["minecraft:material_instances"]).toEqual({
      "*": { texture: ATLAS_KEY, render_method: "opaque" },
    });
    expect(block.permutations).toEqual(
      [0, 1, 2, 3].map((face) => ({
        condition: `q.block_state('yasu_ride:face') == ${face}`,
        components: {
          "minecraft:transformation": {
            rotation: [0, FACE_ROTATION[face], 0],
            translation: [0, lift / 16, 0],
          },
        },
      })),
    );
    // Shut, it shows nothing; open, exactly the bone of each end's item (ADR 0114).
    const geometry = c["minecraft:geometry"];
    for (const open of [false, true])
      for (const end of [0, 1] as const)
        for (const item of [undefined, ...STANDING_GEAR_IDS]) {
          const states = {
            ...pairEndStates(end, item),
            [ROOM_OPEN_STATE]: open,
          };
          const shown = Object.entries(geometry.bone_visibility).filter(
            ([bone, expr]) =>
              bone.startsWith(`end${end}_`) && molangTrue(expr, states),
          );
          expect(shown.map(([bone]) => bone)).toEqual(
            !open || item === undefined ? [] : [`end${end}_${item}`],
          );
        }
  });

  it("defines the fridge's compartment block as a pair block with its slots' heights and a door state, the storage component, no collision, and a box from its floor to the top of the cell (ADR 0123)", () => {
    const standing = SPEC.filter((g) => !g.hanging);
    const block = pairOf("fridge")["minecraft:block"];
    const pages = Math.ceil((standing.length + 1) / PAIR_PAGE_SIZE);
    const range = (n: number) => Array.from({ length: n }, (_, i) => i);
    const [end0, end1] = PAIR_END_STATES;
    const heights = [
      ...new Set(
        DECOR_SLOTS.filter((s) => s.pair?.kind === "fridge").map(
          (s) => s.height,
        ),
      ),
    ].sort((a, b) => a - b);
    expect(heights).toEqual([3, 4]);
    for (const height of heights)
      expect(pairHeightStates("fridge", height)).toEqual({
        [DECOR_HEIGHT_STATE]: height,
      });
    expect(block.description).toEqual({
      identifier: pairDecorBlockId("fridge"),
      menu_category: { category: "none" },
      states: {
        [DECOR_FACE_STATE]: [0, 1, 2, 3],
        [DECOR_HEIGHT_STATE]: heights,
        [ROOM_OPEN_STATE]: [false, true],
        [end0.item]: range(PAIR_PAGE_SIZE),
        [end0.page]: range(pages),
        [end1.item]: range(PAIR_PAGE_SIZE),
        [end1.page]: range(pages),
      },
    });
    const c = block.components;
    expect(c["minecraft:custom_components"]).toEqual([
      CAMPER_CABINET_COMPONENT,
    ]);
    expect(c["minecraft:collision_box"]).toBe(false);
    expect(c).not.toHaveProperty(["minecraft:selection_box"]);
    expect(c["minecraft:material_instances"]).toEqual({
      "*": { texture: ATLAS_KEY, render_method: "opaque" },
    });
    // Lifted by its height, each box runs from the compartment floor to the top of the cell.
    expect(block.permutations).toEqual(
      [0, 1, 2, 3].flatMap((face) =>
        heights.map((height) => ({
          condition: `q.block_state('yasu_ride:face') == ${face} && q.block_state('yasu_ride:height') == ${height}`,
          components: {
            "minecraft:transformation": {
              rotation: [0, FACE_ROTATION[face], 0],
              translation: [0, height / 16, 0],
            },
            "minecraft:selection_box": {
              origin: [-8, 0, -8],
              size: [16, 16 - height, 16],
            },
          },
        })),
      ),
    );
    // The upper compartment, from the divider at model y 36 to the top panel at 48, holds the
    // tallest item (tools/gen_camper.py).
    expect(MAX_STANDING_HEIGHT).toBeLessThanOrEqual(12);
    // Shut, it shows nothing; open, exactly the bone of each end's item.
    const geometry = c["minecraft:geometry"];
    for (const open of [false, true])
      for (const end of [0, 1] as const)
        for (const item of [undefined, ...STANDING_GEAR_IDS]) {
          const states = {
            ...pairEndStates(end, item),
            [ROOM_OPEN_STATE]: open,
          };
          const shown = Object.entries(geometry.bone_visibility).filter(
            ([bone, expr]) =>
              bone.startsWith(`end${end}_`) && molangTrue(expr, states),
          );
          expect(shown.map(([bone]) => bone)).toEqual(
            !open || item === undefined ? [] : [`end${end}_${item}`],
          );
        }
  });

  it("shows exactly the bone of the item that each end's states name, as the scripts set them (ADR 0108)", () => {
    for (const kind of PAIR_KINDS) {
      const geometry =
        pairOf(kind)["minecraft:block"].components["minecraft:geometry"];
      expect(geometry.identifier).toBe(`geometry.yasu_ride.${kind}_decor_pair`);
      const bones = geometryOf(`${kind}_decor_pair`).bones.map((b) => b.name);
      expect(Object.keys(geometry.bone_visibility).sort()).toEqual(
        [...bones].sort(),
      );
      for (const end of [0, 1] as const)
        for (const item of [undefined, ...STANDING_GEAR_IDS]) {
          const states = pairEndStates(end, item);
          const shown = Object.entries(geometry.bone_visibility).filter(
            ([bone, expr]) =>
              bone.startsWith(`end${end}_`) && molangTrue(expr, states),
          );
          expect(shown.map(([bone]) => bone)).toEqual(
            item === undefined ? [] : [`end${end}_${item}`],
          );
        }
    }
  });

  it("draws each end's item at its slot's spot, so the block's turn puts it where the domain measures the slot, with every face on the block's one opaque material (ADR 0108)", () => {
    for (const slot of DECOR_SLOTS.filter((s) => s.pair)) {
      const pair = defined(slot.pair, "pair");
      const { left, forward: ahead } = defined(
        DECOR_SPOTS[slot.spot ?? 0],
        "spot",
      );
      const bones = new Map(
        geometryOf(`${pair.kind}_decor_pair`).bones.map((b) => [
          b.name,
          b.cubes,
        ]),
      );
      // The gear model's frame has the camper's left at -x and its forward at -z,
      // and the generator writes pixels to three decimals.
      const atSpot = ([x, y, z]: [number, number, number]) =>
        [x - left, y, z - ahead].map((v) => Math.round(v * 1000) / 1000 + 0);
      for (const g of SPEC.filter((item) => !item.hanging)) {
        const cubes = defined(bones.get(`end${pair.end}_${g.id}`), g.id);
        expect(cubes, `${slot.id} ${g.id}`).toEqual(
          cubesOf(g.id).map((c) => ({
            ...c,
            ...(c.pivot ? { pivot: atSpot(c.pivot) } : {}),
            origin: atSpot(c.origin),
          })),
        );
      }
      for (const face of [0, 1, 2, 3]) {
        // Bedrock's block turn by r degrees takes (x, z) to (x cos r + z sin r, z cos r - x sin r).
        const r = (FACE_ROTATION[face] ?? Number.NaN) * (Math.PI / 180);
        const [x, z] = [-left, -ahead];
        const offset = decorSpotOffset(90 * face, slot.spot ?? 0);
        expect(x * Math.cos(r) + z * Math.sin(r)).toBeCloseTo(16 * offset.x, 9);
        expect(z * Math.cos(r) - x * Math.sin(r)).toBeCloseTo(16 * offset.z, 9);
      }
    }
  });

  it("defines one stackable item per gear with its icon and name key", () => {
    for (const g of SPEC)
      expect(readJson(`${BP}/items/yasu_ride/${g.id}.item.json`)).toEqual({
        format_version: "1.21.80",
        "minecraft:item": {
          description: {
            identifier: `yasu_ride:${g.id}`,
            menu_category: { category: "items" },
          },
          components: {
            "minecraft:icon": `yasu_ride_${g.id}`,
            "minecraft:max_stack_size": 64,
            "minecraft:display_name": { value: `item.yasu_ride:${g.id}.name` },
          },
        },
      });
  });

  it("registers every gear icon and renders it as a 32 by 32 RGBA image with transparency", () => {
    const data = readJson(`${RP}/textures/item_texture.json`).texture_data;
    for (const key of [
      "yasu_ride_suv_item",
      "yasu_ride_sportsboat_item",
      "yasu_ride_camper_item",
      "yasu_ride_headlight_switch",
    ])
      expect(data).toHaveProperty([key]);
    for (const g of SPEC) {
      expect(data[`yasu_ride_${g.id}`]).toEqual({
        textures: `textures/items/yasu_ride/${g.id}`,
      });
      const { width, height, pixel } = readPng(
        `${RP}/textures/items/yasu_ride/${g.id}.png`,
      );
      expect([width, height], g.id).toEqual([32, 32]);
      expect(pixel(0, 0)[3], g.id).toBe(0);
      let opaque = false;
      for (let y = 0; y < height && !opaque; y++)
        for (let x = 0; x < width && !opaque; x++)
          opaque = pixel(x, y)[3] === 255;
      expect(opaque, g.id).toBe(true);
    }
  });

  it("uses the shared atlas's terrain texture for every decor block", () => {
    const terrain = readJson(`${RP}/textures/terrain_texture.json`);
    expect(terrain.texture_data).toHaveProperty([ATLAS_KEY]);
    for (const g of SPEC)
      expect(
        decorOf(g)["minecraft:block"].components[
          "minecraft:material_instances"
        ]["*"]?.texture,
      ).toBe(ATLAS_KEY);
  });

  it("lists the exact inside, outside, bulldozer, and sports boat groups in order", () => {
    const items = [
      "yasu_ride:camping_gear_box",
      ...SPEC.map((g) => `yasu_ride:${g.id}`),
    ];
    expect(items).toHaveLength(18);
    expect(readJson(`${BP}/item_catalog/crafting_item_catalog.json`)).toEqual({
      format_version: "1.21.60",
      "minecraft:crafting_items_catalog": {
        categories: [
          {
            category_name: "items",
            groups: [
              {
                group_identifier: {
                  icon: "yasu_ride:camping_gear_box",
                  name: "yasu_ride:camping_gear_inside",
                },
                items,
              },
              {
                group_identifier: {
                  icon: "yasu_ride:low_chair_item",
                  name: "yasu_ride:camping_gear_outside",
                },
                items: [
                  "yasu_ride:low_chair_item",
                  "yasu_ride:noga_chair_item",
                  "yasu_ride:tent_item",
                  "yasu_ride:camp_table_item",
                  "yasu_ride:fire_pit_item",
                  "yasu_ride:dutch_oven_item",
                  "yasu_ride:gas_lantern_item",
                ],
              },
              {
                group_identifier: {
                  icon: "yasu_ride:icebreaker_switch",
                  name: "yasu_ride:sportsboat_equipment",
                },
                items: ["yasu_ride:icebreaker_switch"],
              },
              {
                group_identifier: {
                  icon: "yasu_build:build_tool",
                  name: "yasu_build:building_tools",
                },
                items: [
                  "yasu_build:build_tool",
                  "yasu_build:selection_wand",
                  "yasu_ride:blade_switch",
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("keeps outside items separate from decor and each catalog item unique", () => {
    const groups = readJson(`${BP}/item_catalog/crafting_item_catalog.json`)[
      "minecraft:crafting_items_catalog"
    ].categories[0].groups as {
      group_identifier: { name: string };
      items: string[];
    }[];
    const itemsOf = (name: string) =>
      defined(
        groups.find((g) => g.group_identifier.name === `yasu_ride:${name}`),
        name,
      ).items.map((item) => item.slice("yasu_ride:".length));
    const specIds = SPEC.map((g) => g.id);
    expect(itemsOf("camping_gear_inside").slice(1)).toEqual(CAMPING_GEAR_IDS);
    for (const id of itemsOf("camping_gear_outside")) {
      expect(specIds).not.toContain(id);
      expect(CAMPING_GEAR_IDS).not.toContain(id);
    }
    const items = groups.flatMap((g) => g.items);
    expect(new Set(items).size).toBe(items.length);
    expect(groups.map((g) => g.group_identifier.name)).not.toContain(
      "yasu_ride:camping_gear",
    );
  });

  it.each(["en_US", "ja_JP"])(
    "names the group, every gear item, and every decor block in %s",
    (locale) => {
      const values = langValues(locale);
      const name = (g: Gear) => (locale === "en_US" ? g.name_en : g.name_ja);
      const expected = new Map<string, string>([
        [
          "yasu_ride:camping_gear_inside",
          locale === "en_US"
            ? "Camping Gear (Inside)"
            : `${JA_GROUP_NAME}\uff08\u8eca\u5185\u7528\uff09`,
        ],
        [
          "yasu_ride:camping_gear_outside",
          locale === "en_US"
            ? "Camping Gear (Outside)"
            : `${JA_GROUP_NAME}\uff08\u8eca\u5916\u7528\uff09`,
        ],
        ...SPEC.map((g): [string, string] => [
          `item.yasu_ride:${g.id}.name`,
          name(g),
        ]),
        ...SPEC.map((g): [string, string] => [
          `tile.yasu_ride:${g.id}_decor.name`,
          name(g),
        ]),
      ]);
      expect(expected.size).toBe(2 + 2 * SPEC.length);
      expect(values.has("yasu_ride:camping_gear")).toBe(false);
      for (const [key, value] of expected)
        expect(values.get(key), key).toEqual([value]);
    },
  );
});
