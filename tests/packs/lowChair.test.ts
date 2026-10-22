// The low chair's pack files (ADR 0122); tests/packs/layout.test.ts covers their paths and ids.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOW_CHAIR_TYPE as CHAIR,
  CHAIR_FAMILY,
  HITS_LEFT_HINT,
  LOW_CHAIR_ITEM as ITEM,
} from "../../src/infrastructure/camp/identifiers";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

interface Cube {
  origin: [number, number, number];
  size: [number, number, number];
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  uv: Record<string, { uv: [number, number] }>;
}

const geometry = () =>
  readJson(`${RP}/models/entity/yasu_ride/low_chair.geo.json`)[
    "minecraft:geometry"
  ][0];
const cubes = (): Cube[] =>
  geometry().bones.flatMap((b: { cubes: Cube[] }) => b.cubes);

// x and z turn the other way from a right-handed rotation in game, as in
// tools/render_preview.py's game_turn (ADR 0051, 0058).
function corners(cube: Cube): [number, number, number][] {
  const [x0, y0, z0] = cube.origin;
  const [w, h, d] = cube.size;
  const points: [number, number, number][] = [];
  for (const i of [0, 1])
    for (const j of [0, 1])
      for (const k of [0, 1]) points.push([x0 + i * w, y0 + j * h, z0 + k * d]);
  if (!cube.rotation || !cube.pivot) return points;
  const [px, py, pz] = cube.pivot;
  const [rx, , rz] = cube.rotation.map((a) => (a * Math.PI) / 180);
  return points.map(([x, y, z]) => {
    let [dx, dy, dz] = [x - px, y - py, z - pz];
    [dy, dz] = [
      dy * Math.cos(rx ?? 0) + dz * Math.sin(rx ?? 0),
      -dy * Math.sin(rx ?? 0) + dz * Math.cos(rx ?? 0),
    ];
    [dx, dy] = [
      dx * Math.cos(rz ?? 0) + dy * Math.sin(rz ?? 0),
      -dx * Math.sin(rz ?? 0) + dy * Math.cos(rz ?? 0),
    ];
    return [dx + px, dy + py, dz + pz];
  });
}

const langValue = (locale: string, key: string): string | undefined =>
  readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1);

describe("low chair entity (ADR 0122)", () => {
  const entity = readJson(`${BP}/entities/yasu_ride/low_chair.se.json`)[
    "minecraft:entity"
  ];

  it("is a summonable seat that never moves, despawns, or takes damage", () => {
    expect(entity.description).toEqual({
      identifier: CHAIR,
      is_spawnable: false,
      is_summonable: true,
    });
    expect(Object.keys(entity.components).sort()).toEqual(
      [
        "minecraft:type_family",
        "minecraft:collision_box",
        "minecraft:physics",
        "minecraft:pushable",
        "minecraft:knockback_resistance",
        "minecraft:health",
        "minecraft:damage_sensor",
        "minecraft:persistent",
        "minecraft:rideable",
      ].sort(),
    );
    const c = entity.components;
    // inanimate keeps vehicle rams off it (ADR 0006)
    expect(c["minecraft:type_family"].family).toEqual([
      CHAIR_FAMILY,
      "inanimate",
    ]);
    // It settles through short grass, carpet, or a slab's empty half onto what holds it (ADR 0122).
    expect(c["minecraft:physics"]).toEqual({
      has_collision: true,
      has_gravity: true,
    });
    expect(c["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(c["minecraft:damage_sensor"]).toEqual({
      triggers: { cause: "all", deals_damage: "no" },
    });
    expect(entity.component_groups).toBeUndefined();
    expect(entity.events).toBeUndefined();
  });

  it("seats one player with the Sit interaction", () => {
    const rideable = entity.components["minecraft:rideable"];
    expect(rideable).toMatchObject({
      seat_count: 1,
      family_types: ["player"],
      interact_text: "action.interact.yasu_ride.sit",
      crouching_skip_interact: true,
    });
    expect(rideable.seats).toHaveLength(1);
    expect(langValue("en_US", rideable.interact_text)).toBe("Sit");
    expect(langValue("ja_JP", rideable.interact_text)).toBeTruthy();
  });

  it("puts the seat about as far below the sling top as the camper's cushions sit above theirs", () => {
    // The camper's front cushion top is about 0.24 above its rideable seat (ADR 0122).
    const sling = cubes().find(
      (c) => !c.rotation && c.uv.north?.uv[0] === 0 && c.uv.north?.uv[1] === 0,
    );
    if (!sling) throw new Error("no sling cube");
    const top = (sling.origin[1] + sling.size[1]) / 16;
    const [, y] = entity.components["minecraft:rideable"].seats[0].position;
    expect(Math.abs(y - (top - 0.24))).toBeLessThanOrEqual(0.03);
  });

  it("keeps its collision box no wider than a block", () => {
    const box = entity.components["minecraft:collision_box"];
    expect(box.width).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(1);
  });
});

describe("low chair model (ADR 0009, 0122)", () => {
  it("draws the geometry and texture the client entity names", () => {
    const client = readJson(`${RP}/entity/yasu_ride/low_chair.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.identifier).toBe(CHAIR);
    expect(client.geometry.default).toBe(geometry().description.identifier);
    expect(existsSync(`${RP}/${client.textures.default}.png`)).toBe(true);
    expect(client.render_controllers).toEqual(["controller.render.default"]);
  });

  it("stays within about 0.8 block wide, a block high, and a block deep", () => {
    const points = cubes().flatMap(corners);
    const span = (i: number) => [
      Math.min(...points.map((p) => p[i] ?? 0)),
      Math.max(...points.map((p) => p[i] ?? 0)),
    ];
    const [x0, x1] = span(0);
    const [y0, y1] = span(1);
    const [z0, z1] = span(2);
    expect(x0).toBeGreaterThanOrEqual(-6.5);
    expect(x1).toBeLessThanOrEqual(6.5);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(y1).toBeLessThanOrEqual(17);
    expect(z0).toBeGreaterThanOrEqual(-8);
    expect(z1).toBeLessThanOrEqual(8);
  });

  it("reclines the back toward the rear (+z), away from the front at -z", () => {
    const back = cubes().filter((c) => c.rotation && c.rotation[0] !== 0);
    expect(back.length).toBeGreaterThan(0);
    for (const cube of back) {
      // The middles of the bottom and top faces: every corner of each face, averaged
      const points = corners(cube);
      const middle = (j: number) => {
        const face = points.filter((_, n) => Math.floor(n / 2) % 2 === j);
        return face.reduce((sum, p) => sum + (p[2] ?? 0), 0) / face.length;
      };
      expect(middle(1)).toBeGreaterThan(middle(0));
    }
  });
});

describe("low chair item (ADR 0122)", () => {
  it("defines a stackable item with its icon", () => {
    const item = readJson(`${BP}/items/yasu_ride/low_chair_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(ITEM);
    expect(item.components["minecraft:icon"]).toBe("yasu_ride_low_chair_item");
    expect(item.components["minecraft:max_stack_size"]).toBe(16);
    const icons = readJson(`${RP}/textures/item_texture.json`).texture_data;
    const icon = icons.yasu_ride_low_chair_item.textures;
    expect(icon).toBe("textures/items/yasu_ride/low_chair_item");
    expect(existsSync(`${RP}/${icon}.png`)).toBe(true);
  });

  it("is in the Camping Gear group of the Items tab", () => {
    const catalog = readJson(`${BP}/item_catalog/crafting_item_catalog.json`);
    const items = catalog["minecraft:crafting_items_catalog"].categories
      .flatMap((c: { groups: { items: string[] }[] }) => c.groups)
      .flatMap((g: { items: string[] }) => g.items);
    expect(items).toContain(ITEM);
  });

  it("is crafted from leather, sticks, and iron ingots", () => {
    const recipe = readJson(
      `${BP}/recipes/yasu_ride/low_chair_item.recipe.json`,
    )["minecraft:recipe_shaped"];
    expect(recipe.result).toEqual({ item: ITEM, count: 1 });
    const keys = Object.values(recipe.key).map(
      (k) => (k as { item: string }).item,
    );
    expect(keys.sort()).toEqual([
      "minecraft:iron_ingot",
      "minecraft:leather",
      "minecraft:stick",
    ]);
  });

  it.each(["en_US", "ja_JP"])(
    "names the item, the entity, and the take-back hint in %s",
    (locale) => {
      for (const key of [
        `item.${ITEM}.name`,
        `entity.${CHAIR}.name`,
        HITS_LEFT_HINT,
      ])
        expect(langValue(locale, key), key).toBeTruthy();
      expect(langValue(locale, HITS_LEFT_HINT)).toContain("%s");
    },
  );
});
