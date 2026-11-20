import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRgbaPng } from "../support/png";

const WAND = "yasu_build:selection_wand";
const ROTATE = "yasu_build:paste_rotate";
const PLACE = "yasu_build:paste_place";
const UNDO = "yasu_build:build_undo";
const TOOL = "yasu_build:warp_tool";
const BLOCK = "yasu_build:warp_block";
const GROUP = "yasu_build:building_tools";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// Keep Japanese names escaped so only the translation file contains CJK text.
const JA = {
  [ROTATE]: "\u8cbc\u308a\u4ed8\u3051\u56de\u8ee2",
  [PLACE]: "\u8cbc\u308a\u4ed8\u3051\u914d\u7f6e",
  [UNDO]: "\u30d3\u30eb\u30c9\u53d6\u308a\u6d88\u3057",
  [TOOL]: "\u30ef\u30fc\u30d7\u30c4\u30fc\u30eb",
  [BLOCK]: "\u30ef\u30fc\u30d7\u30d6\u30ed\u30c3\u30af",
  [WAND]: JSON.parse('"\\u7bc4\\u56f2\\u9078\\u629e\\u30ef\\u30f3\\u30c9"'),
  [GROUP]: JSON.parse('"\\u5efa\\u7bc9\\u30c4\\u30fc\\u30eb"'),
};
const EN = {
  [ROTATE]: "Paste Rotate",
  [PLACE]: "Paste Place",
  [UNDO]: "Build Undo",
  [TOOL]: "Warp Tool",
  [BLOCK]: "Warp Block",
  [WAND]: "Selection Wand",
  [GROUP]: "Building Tools",
};

describe.each([
  ["selection_wand", WAND],
  ["paste_rotate", ROTATE],
  ["paste_place", PLACE],
  ["build_undo", UNDO],
  ["warp_tool", TOOL],
])("the %s item", (name, type) => {
  it("keeps item, recipe, and icon paths within the console limit", () => {
    for (const path of [
      `packs/yasu_ride_bp/items/yasu_build/${name}.item.json`,
      `packs/yasu_ride_bp/recipes/yasu_build/${name}.recipe.json`,
      `packs/yasu_ride_rp/textures/items/yasu_build/${name}.png`,
    ]) {
      expect(path.length).toBeLessThanOrEqual(80);
    }
  });

  it("is a single-stack item with its icon and display name", () => {
    expect(
      read(`packs/yasu_ride_bp/items/yasu_build/${name}.item.json`),
    ).toEqual({
      format_version: "1.21.80",
      "minecraft:item": {
        description: {
          identifier: type,
          menu_category: { category: "items" },
        },
        components: {
          "minecraft:icon": `yasu_build_${name}`,
          "minecraft:max_stack_size": 1,
          "minecraft:use_modifiers": {
            use_duration: 0.1,
            movement_modifier: 1.0,
          },
          "minecraft:display_name": { value: `item.${type}.name` },
        },
      },
    });
  });

  it("has a 16x16 icon registered in the item atlas", () => {
    expect(
      read("packs/yasu_ride_rp/textures/item_texture.json").texture_data[
        `yasu_build_${name}`
      ],
    ).toEqual({ textures: `textures/items/yasu_build/${name}` });
    const { width, height, pixels } = readRgbaPng(
      `packs/yasu_ride_rp/textures/items/yasu_build/${name}.png`,
    );
    expect([width, height]).toEqual([16, 16]);
    expect(pixels[3]).toBe(
      ["selection_wand", "warp_tool"].includes(name) ? 0 : 255,
    );
    expect(
      Array.from(pixels).some((alpha, i) => i % 4 === 3 && alpha === 255),
    ).toBe(true);
  });
});

describe("Build control glyph icons", () => {
  const controls = ["paste_rotate", "paste_place", "build_undo"];
  const icon = (name: string) =>
    readRgbaPng(`packs/yasu_ride_rp/textures/items/yasu_build/${name}.png`);
  const pixelAt = (pixels: Uint8Array, x: number, y: number) =>
    Array.from(pixels.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4));
  const yellow = [250, 190, 20, 255];
  const black = [0, 0, 0, 255];

  it.each(controls)("%s is a black glyph on a full yellow tile", (name) => {
    const { width, height, pixels } = icon(name);
    expect([width, height]).toEqual([16, 16]);
    for (const [x, y] of [
      [0, 0],
      [15, 0],
      [0, 15],
      [15, 15],
    ] as const) {
      expect(pixelAt(pixels, x, y)).toEqual(yellow);
    }
    const glyph: number[][] = [];
    const wandGlyph: number[][] = [];
    const wand = icon("selection_wand");
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const pixel = pixelAt(pixels, x, y);
        expect([yellow, black]).toContainEqual(pixel);
        if (x >= 2 && x < 14 && y >= 2 && y < 14) {
          glyph.push(pixel);
          wandGlyph.push(pixelAt(wand.pixels, x, y));
        } else {
          expect(pixel).toEqual(yellow);
        }
      }
    }
    expect(glyph).toContainEqual(black);
    expect(glyph).not.toEqual(wandGlyph);
  });

  it.each(controls)("%s differs from the other controls and wand", (name) => {
    for (const other of [...controls, "selection_wand"]) {
      if (other !== name)
        expect(icon(name).pixels).not.toEqual(icon(other).pixels);
    }
  });
});

describe("Building Tools recipes and names", () => {
  it.each([
    ["selection_wand", WAND, ["minecraft:copper_ingot", "minecraft:stick"]],
    ["paste_rotate", ROTATE, ["minecraft:flint", "minecraft:stick"]],
    ["paste_place", PLACE, ["minecraft:clay_ball", "minecraft:stick"]],
    ["build_undo", UNDO, ["minecraft:slime_ball", "minecraft:stick"]],
    ["warp_tool", TOOL, ["minecraft:compass", "minecraft:copper_ingot"]],
    [
      "warp_block",
      BLOCK,
      ["minecraft:ender_pearl", "minecraft:iron_ingot", "minecraft:redstone"],
    ],
  ])("crafts %s from its specified ingredients", (name, type, items) => {
    const recipe = read(
      `packs/yasu_ride_bp/recipes/yasu_build/${name}.recipe.json`,
    )["minecraft:recipe_shapeless"];
    expect(recipe.description.identifier).toBe(type);
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(
      recipe.ingredients.map((i: { item: string }) => i.item).sort(),
    ).toEqual(items);
  });

  it.each([
    ["en_US", EN],
    ["ja_JP", JA],
  ])("names the tools, block and group in %s", (locale, names) => {
    const values = new Map(
      readFileSync(`packs/yasu_ride_rp/texts/${locale}.lang`, "utf8")
        .split("\n")
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    );
    expect(values.get(`item.${ROTATE}.name`)).toBe(names[ROTATE]);
    expect(values.get(`item.${PLACE}.name`)).toBe(names[PLACE]);
    expect(values.get(`item.${UNDO}.name`)).toBe(names[UNDO]);
    expect(values.get("yasu_build.message.paste_inactive")).toBe(
      locale === "en_US"
        ? "Copy something first."
        : "\u5148\u306b\u4f55\u304b\u3092\u30b3\u30d4\u30fc\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    );
    expect(values.get("yasu_build.message.paste_ready")).toContain(
      locale === "en_US"
        ? "Rotate / Place items"
        : "\u56de\u8ee2\u30fb\u914d\u7f6e\u30a2\u30a4\u30c6\u30e0",
    );
    expect(
      values.get("yasu_build.message.paste_ready")?.match(/%s/g),
    ).toHaveLength(5);
    expect(values.get(`item.${WAND}.name`)).toBe(names[WAND]);
    expect(values.get(`item.${TOOL}.name`)).toBe(names[TOOL]);
    expect(values.get(`tile.${BLOCK}.name`)).toBe(names[BLOCK]);
    expect(values.get(GROUP)).toBe(names[GROUP]);
  });
});
