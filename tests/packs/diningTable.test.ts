import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  GAS_LANTERN_FOOTPRINT_PX,
} from "../../src/domain/camp/spec";
import { FURNITURE_SPEC } from "../../src/domain/resort/furniture";
import { placeOnTop, type TopItem } from "../../src/domain/shared/tableTop";
import { readRgbaPng } from "../support/png";

const BP = "packs/yasu_ride_bp/";
const RP = "packs/yasu_ride_rp/";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const top = FURNITURE_SPEC.dining_table.top;
if (!top) throw new Error("Dining Table requires a top");

it("ships a persistent, damage-immune table with whole-model hits and no seats", () => {
  const entity = read(`${BP}entities/yasu_ride/dining_table.se.json`)[
    "minecraft:entity"
  ];
  expect(entity.description).toEqual({
    identifier: "yasu_ride:dining_table",
    is_spawnable: false,
    is_summonable: true,
  });
  const c = entity.components;
  expect(c["minecraft:type_family"].family).toEqual([
    "yasu_ride_dining_table",
    "inanimate",
  ]);
  expect(c["minecraft:persistent"]).toEqual({});
  expect(c["minecraft:physics"]).toEqual({
    has_collision: true,
    has_gravity: true,
  });
  expect(c["minecraft:pushable"]).toEqual({
    is_pushable: false,
    is_pushable_by_piston: false,
  });
  expect(c["minecraft:damage_sensor"].triggers).toEqual({
    cause: "all",
    deals_damage: "no",
  });
  expect(c["minecraft:knockback_resistance"].value).toBe(1);
  expect(c["minecraft:rideable"]).toBeUndefined();
  expect(c["minecraft:collision_box"]).toEqual({
    width: 15 / 16,
    height: top.topPx / 16,
  });
  expect(c["minecraft:custom_hit_test"].hitboxes).toEqual([
    { width: 1, height: top.topPx / 16, pivot: [0, top.topPx / 32, 0] },
  ]);
});

it("pins the model, usable woven top, splayed legs, brace and atlas to the domain", () => {
  const geometry = read(`${RP}models/entity/yasu_ride/dining_table.geo.json`)[
    "minecraft:geometry"
  ][0];
  expect(geometry.description.identifier).toBe(
    "geometry.yasu_ride.dining_table",
  );
  expect(geometry.bones.map((b: { name: string }) => b.name)).toEqual([
    "root",
    "top",
    "legs",
    "ring",
  ]);
  const constants = JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path("tools").resolve()))
from tool_loader import load_tool
m = load_tool("gen_dining_table")
g = m.geometry()["minecraft:geometry"][0]
top = g["bones"][1]["cubes"]
legs = g["bones"][2]["cubes"]
ring = g["bones"][3]["cubes"]
assert len(legs) == m.ASSEMBLIES["legs"]["cubes"]
assert m.RING_SEGMENTS >= 16 and len(ring) == m.RING_SEGMENTS * m.TUBE_BARS
m.tilt.assert_axes(legs + ring, {"legs": legs, "ring": ring}, m.ASSEMBLIES)
lo, hi = m.tilt.bounds([c for b in g["bones"] for c in b.get("cubes", [])])
assert all(-8 <= lo[i] <= hi[i] <= 8 for i in (0, 2)), (lo, hi)
assert lo[1] >= 0 and hi[1] == m.TOP_PX, (lo, hi)
top_lo, top_hi = m.tilt.bounds(top)
assert top_lo[0] == top_lo[2] == -m.TOP_HALF and top_hi[0] == top_hi[2] == m.TOP_HALF
assert m.LEG_TOP_OFFSET > m.LEG_WAIST < m.LEG_FOOT_OFFSET
assert m.LEG_WAIST_WIDTH > m.LEG_FOOT_WIDTH
# Check the transformed segment axes, including both sides of each bend.
for sx in (-1, 1):
    for sz in (-1, 1):
        cubes = m.leg(sx, sz)
        for i in range(2 * m.TAPER_STEPS):
            cube = cubes[i * m.TUBE_BARS]
            axis = m.tilt.apply_matrix(m.tilt.cube_matrix(cube["rotation"]), [0, 1, 0])
            direction = -1 if i < m.TAPER_STEPS else 1
            assert axis[0] * sx * direction > 0 and axis[2] * sz * direction > 0
            assert axis[1] > 0
        assert cubes[-1]["uv"]["up"]["uv"] == [16, m.WEAVE_SIZE]
ring_lo, ring_hi = m.tilt.bounds(ring)
assert abs(ring_lo[1] - (m.RING_Y - m.RING_HALF)) < 0.001
assert abs(ring_hi[1] - (m.RING_Y + m.RING_HALF)) < 0.001
assert all(-m.TOP_HALF <= lo[i] <= hi[i] <= m.TOP_HALF for i in (0, 2))
print(json.dumps([m.TOP_HALF, m.TOP_PX, m.TOP_LIMIT, m.TEXTURE_WIDTH, m.TEXTURE_HEIGHT]))
`,
      ],
      { encoding: "utf8" },
    ),
  );
  const [halfPx, topPx, limit, textureWidth, textureHeight] = constants;
  expect([halfPx, topPx, limit]).toEqual([
    top.half.halfX,
    top.topPx,
    top.limit,
  ]);
  expect(top.half.halfX).toBe(top.half.halfZ);
  expect(geometry.bones[1].cubes[0].uv.up).toEqual({
    uv: [0, 0],
    uv_size: [textureWidth, textureWidth],
  });
  const texture = readRgbaPng(
    `${RP}textures/entity/yasu_ride/dining_table.png`,
  );
  expect([texture.width, texture.height]).toEqual([
    textureWidth,
    textureHeight,
  ]);
  expect([
    geometry.description.texture_width,
    geometry.description.texture_height,
  ]).toEqual([textureWidth, textureHeight]);
});

it("holds one Dutch Oven or up to four Gas Lanterns in the corners", () => {
  for (const footprint of [GAS_LANTERN_FOOTPRINT_PX, DUTCH_OVEN_FOOTPRINT_PX]) {
    expect(
      placeOnTop(top.half, top.limit, [], { x: 0, z: 0 }, footprint),
    ).toEqual({ ok: true, at: { x: 0, z: 0 } });
  }
  const lanterns: TopItem[] = [];
  for (const [x, z] of [
    [-8, -8],
    [8, -8],
    [-8, 8],
    [8, 8],
  ] as const) {
    const placement = placeOnTop(
      top.half,
      top.limit,
      lanterns,
      { x, z },
      GAS_LANTERN_FOOTPRINT_PX,
    );
    expect(placement.ok).toBe(true);
    if (placement.ok)
      lanterns.push({ at: placement.at, footprint: GAS_LANTERN_FOOTPRINT_PX });
  }
  expect(lanterns).toHaveLength(top.limit);
  expect(
    placeOnTop(
      top.half,
      top.limit,
      lanterns,
      { x: 0, z: 0 },
      GAS_LANTERN_FOOTPRINT_PX,
    ),
  ).toEqual({ ok: false, reason: "full" });
  const oven = placeOnTop(
    top.half,
    top.limit,
    [],
    { x: -8, z: -8 },
    DUTCH_OVEN_FOOTPRINT_PX,
  );
  expect(oven.ok).toBe(true);
  if (!oven.ok) return;
  expect(
    placeOnTop(
      top.half,
      top.limit,
      [{ at: oven.at, footprint: DUTCH_OVEN_FOOTPRINT_PX }],
      { x: 8, z: 8 },
      GAS_LANTERN_FOOTPRINT_PX,
    ),
  ).toEqual({ ok: false, reason: "overlap" });
});

it("links the client, render controller, item icon, recipe and translations", () => {
  const client = read(`${RP}entity/yasu_ride/dining_table.ce.json`)[
    "minecraft:client_entity"
  ].description;
  expect(client.identifier).toBe("yasu_ride:dining_table");
  expect(client.geometry.default).toBe("geometry.yasu_ride.dining_table");
  expect(client.textures.default).toBe(
    "textures/entity/yasu_ride/dining_table",
  );
  const controller = "controller.render.yasu_ride.dining_table";
  expect(client.render_controllers).toEqual([controller]);
  expect(
    read(`${RP}render_controllers/yasu_ride/dining_table.rc.json`)
      .render_controllers[controller],
  ).toEqual({
    geometry: "Geometry.default",
    materials: [{ "*": "Material.default" }],
    textures: ["Texture.default"],
  });
  const item = read(`${BP}items/yasu_ride/dining_table_item.item.json`)[
    "minecraft:item"
  ];
  expect(item.description).toEqual({
    identifier: "yasu_ride:dining_table_item",
    menu_category: { category: "items" },
  });
  expect(item.components).toEqual({
    "minecraft:icon": "yasu_ride_dining_table",
    "minecraft:max_stack_size": 1,
    "minecraft:display_name": {
      value: "item.yasu_ride:dining_table_item.name",
    },
  });
  expect(
    read(`${RP}textures/item_texture.json`).texture_data.yasu_ride_dining_table
      .textures,
  ).toBe("textures/items/yasu_ride/dining_table_item");
  const recipe = read(`${BP}recipes/yasu_ride/dining_table_item.recipe.json`)[
    "minecraft:recipe_shaped"
  ];
  expect(recipe.pattern).toEqual(["PPP", "SIS", "I I"]);
  expect(recipe.key).toEqual({
    P: { tag: "minecraft:planks" },
    S: { item: "minecraft:stick" },
    I: { item: "minecraft:iron_ingot" },
  });
  expect(recipe.tags).toEqual(["crafting_table"]);
  expect(recipe.result).toEqual({
    item: "yasu_ride:dining_table_item",
    count: 1,
  });
  const signature = (r: typeof recipe) =>
    r.pattern
      .map((row: string) =>
        [...row].map((key) => JSON.stringify(r.key[key] ?? null)).join("|"),
      )
      .join("/");
  for (const file of readdirSync(`${BP}recipes/yasu_ride`)) {
    if (file === "dining_table_item.recipe.json") continue;
    const other = read(`${BP}recipes/yasu_ride/${file}`)[
      "minecraft:recipe_shaped"
    ];
    if (other) expect(signature(other)).not.toBe(signature(recipe));
  }
  for (const locale of ["en_US", "ja_JP"]) {
    const lang = readFileSync(`${RP}texts/${locale}.lang`, "utf8");
    for (const key of [
      "item.yasu_ride:dining_table_item.name",
      "entity.yasu_ride:dining_table.name",
      ...["full", "overlap", "too_big"].map(
        (reason) => `yasu_ride.dining_table_top_${reason}`,
      ),
    ])
      expect(lang).toContain(`${key}=`);
    if (locale === "en_US")
      expect(lang).toContain(
        "item.yasu_ride:dining_table_item.name=Dining Table",
      );
  }
});
