import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAIR_KIND_BY_ITEM,
  CHAIR_KIND_BY_TEST_EVENT,
  CHAIR_KIND_BY_TYPE,
  CHAIR_KINDS,
} from "../../src/infrastructure/camp/identifiers";
import { assertOneAxis } from "./oneAxis";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const profile = CHAIR_KINDS.noga_chair;
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
type Vec = [number, number, number];
type Cube = {
  origin: Vec;
  size: Vec;
  pivot?: Vec;
  rotation?: Vec;
  uv: Record<string, { uv: number[] }>;
};
const geo = read(`${RP}/models/entity/yasu_ride/noga_chair.geo.json`)[
  "minecraft:geometry"
][0];
const cubes: Cube[] = geo.bones[0].cubes;
const back = cubes.slice(6, 33);
const entity = read(`${BP}/entities/yasu_ride/noga_chair.se.json`)[
  "minecraft:entity"
];
const lang = (locale: string, key: string) =>
  readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1);

// Game convention: x and z have reversed signs, with x then y then z (ADR 0167).
function corners(cube: Cube): Vec[] {
  const [rx, ry, rz] = (cube.rotation ?? [0, 0, 0]).map(
    (a) => (a * Math.PI) / 180,
  ) as Vec;
  const [px, py, pz] = cube.pivot ?? [0, 0, 0];
  const points: Vec[] = [];
  for (const i of [0, 1])
    for (const j of [0, 1])
      for (const k of [0, 1]) {
        let x = cube.origin[0] + i * cube.size[0] - px;
        let y = cube.origin[1] + j * cube.size[1] - py;
        let z = cube.origin[2] + k * cube.size[2] - pz;
        [y, z] = [
          y * Math.cos(rx) + z * Math.sin(rx),
          -y * Math.sin(rx) + z * Math.cos(rx),
        ];
        [x, z] = [
          x * Math.cos(ry) + z * Math.sin(ry),
          -x * Math.sin(ry) + z * Math.cos(ry),
        ];
        [x, y] = [
          x * Math.cos(rz) + y * Math.sin(rz),
          -x * Math.sin(rz) + y * Math.cos(rz),
        ];
        points.push([x + px, y + py, z + pz]);
      }
  return points;
}

describe("Noga Chair (ADR 0169)", () => {
  it("routes its item, entity, and test event through the chair profile", () => {
    expect(profile).toEqual({
      typeId: "yasu_ride:noga_chair",
      itemId: "yasu_ride:noga_chair_item",
      family: "yasu_ride_noga_chair",
      hitsHint: "yasu_ride.hint.noga_chair_hits",
      testHitEvent: "yasu_ride_test:test_noga_chair_hit",
    });
    for (const [map, key] of [
      [CHAIR_KIND_BY_TYPE, profile.typeId],
      [CHAIR_KIND_BY_ITEM, profile.itemId],
      [CHAIR_KIND_BY_TEST_EVENT, profile.testHitEvent],
    ] as const)
      expect(map.get(key)).toBe("noga_chair");
  });

  it("provides a persistent, damage-proof one-player seat with gravity", () => {
    expect(entity.description).toEqual({
      identifier: profile.typeId,
      is_spawnable: false,
      is_summonable: true,
    });
    const c = entity.components;
    expect(c["minecraft:type_family"].family).toEqual([
      profile.family,
      "inanimate",
    ]);
    expect(c["minecraft:rideable"]).toEqual({
      seat_count: 1,
      family_types: ["player"],
      interact_text: "action.interact.yasu_ride.sit",
      crouching_skip_interact: true,
      seats: [{ position: [0, 0.1, 0.18] }],
    });
    expect(c["minecraft:collision_box"]).toEqual({ width: 0.8, height: 0.9 });
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
    expect(c["minecraft:persistent"]).toEqual({});
  });

  it("connects the root geometry, texture, preview, and icon", () => {
    const client = read(`${RP}/entity/yasu_ride/noga_chair.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.identifier).toBe(profile.typeId);
    expect(client.geometry.default).toBe("geometry.yasu_ride.noga_chair");
    expect(geo.description.identifier).toBe(client.geometry.default);
    expect(client.render_controllers).toEqual(["controller.render.default"]);
    expect(geo.bones.map((bone: { name: string }) => bone.name)).toEqual([
      "root",
    ]);
    expect(existsSync(`${RP}/${client.textures.default}.png`)).toBe(true);
    expect(existsSync("docs/images/items/camping-gear/noga_chair.png")).toBe(
      true,
    );
    expect(cubes.length).toBeLessThan(250);
  });

  it("limits compound turns to the 27-cube back sling and four one-pole leg assemblies", () => {
    const legs = cubes.filter(
      (c) =>
        Math.abs(c.size[0] - 0.8) < 1e-6 &&
        Math.abs(c.size[2] - 0.8) < 1e-6 &&
        c.origin[1] === 0.6,
    );
    expect(legs).toHaveLength(4);
    expect(back).toHaveLength(27);
    expect(back.every((c) => c.rotation?.some((a) => a !== 0))).toBe(true);
    expect(() =>
      assertOneAxis(cubes, { back_sling: back, legs }),
    ).not.toThrow();
    expect(() => assertOneAxis(cubes, { legs })).toThrow();
  });

  it("keeps every transformed corner inside the cell with a low seat and rearward recline", () => {
    for (const [x, y, z] of cubes.flatMap(corners)) {
      expect(x).toBeGreaterThanOrEqual(-7.5);
      expect(x).toBeLessThanOrEqual(7.5);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(16);
      expect(z).toBeGreaterThanOrEqual(-8);
      expect(z).toBeLessThanOrEqual(8);
    }
    const seat = cubes[0];
    if (!seat) throw new Error("missing seat");
    expect(seat.origin[1] + seat.size[1]).toBe(5);
    for (const cube of back) {
      const pts = corners(cube);
      const average = (indices: number[], axis: number) =>
        indices.reduce((sum, i) => sum + (pts[i]?.[axis] ?? 0), 0) /
        indices.length;
      expect(average([2, 3, 6, 7], 2)).toBeGreaterThan(
        average([0, 1, 4, 5], 2),
      );
      expect(average([2, 3, 6, 7], 1)).toBeGreaterThan(
        average([0, 1, 4, 5], 1),
      );
    }
  });

  it("has a stackable item and its own icon, directly after the Low Chair", () => {
    const item = read(`${BP}/items/yasu_ride/noga_chair_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(profile.itemId);
    expect(item.components["minecraft:max_stack_size"]).toBe(16);
    expect(item.components["minecraft:icon"]).toBe("yasu_ride_noga_chair_item");
    const icon = read(`${RP}/textures/item_texture.json`).texture_data
      .yasu_ride_noga_chair_item.textures;
    expect(icon).toBe("textures/items/yasu_ride/noga_chair_item");
    expect(existsSync(`${RP}/${icon}.png`)).toBe(true);
    const groups = read(`${BP}/item_catalog/crafting_item_catalog.json`)[
      "minecraft:crafting_items_catalog"
    ].categories.flatMap((c: { groups: { items: string[] }[] }) => c.groups);
    const group = groups.find((g: { items: string[] }) =>
      g.items.includes(profile.itemId),
    );
    expect(group.items.slice(0, 2)).toEqual([
      CHAIR_KINDS.low_chair.itemId,
      profile.itemId,
    ]);
  });

  it("uses a distinct wool-and-iron recipe", () => {
    const recipe = read(`${BP}/recipes/yasu_ride/noga_chair_item.recipe.json`)[
      "minecraft:recipe_shaped"
    ];
    expect(recipe.pattern).toEqual(["WW ", "WIW", "I I"]);
    expect(recipe.key).toEqual({
      W: { tag: "minecraft:wool" },
      I: { item: "minecraft:iron_ingot" },
    });
    expect(recipe.result).toEqual({ item: profile.itemId, count: 1 });
    for (const other of ["low_chair", "tent"])
      expect(recipe.pattern).not.toEqual(
        read(`${BP}/recipes/yasu_ride/${other}_item.recipe.json`)[
          "minecraft:recipe_shaped"
        ].pattern,
      );
  });

  it.each(["en_US", "ja_JP"])(
    "names the chair and its fold hint in %s",
    (locale) => {
      for (const key of [
        `entity.${profile.typeId}.name`,
        `item.${profile.itemId}.name`,
        "action.interact.yasu_ride.sit",
      ])
        expect(lang(locale, key)).toBeTruthy();
      expect(lang(locale, profile.hitsHint)).toContain("%s");
      if (locale === "en_US")
        expect(lang(locale, `item.${profile.itemId}.name`)).toBe("Noga Chair");
    },
  );

  it("ships RP 0.1.176 and matches the BP dependency", () => {
    const rp = read(`${RP}/manifest.json`);
    expect(rp.header.version).toEqual([0, 1, 176]);
    expect(rp.modules[0].version).toEqual(rp.header.version);
    expect(
      read(`${BP}/manifest.json`).dependencies.find(
        (d: { uuid?: string }) => d.uuid === rp.header.uuid,
      ).version,
    ).toEqual(rp.header.version);
  });
});
