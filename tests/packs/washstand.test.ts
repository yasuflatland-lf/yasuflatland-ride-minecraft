import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FURNITURE_SPEC } from "../../src/domain/resort/furniture";
import { FURNITURE_IDS } from "../../src/infrastructure/resort/identifiers";
import { readRgbaPng } from "../support/png";
import { RESORT_CATALOG_ITEMS_JSON, RESORT_GEAR } from "../support/resortGear";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const entity = read(`${BP}/entities/yasu_ride/washstand.se.json`)[
  "minecraft:entity"
];
const client = read(`${RP}/entity/yasu_ride/washstand.ce.json`)[
  "minecraft:client_entity"
].description;
const geometry = read(`${RP}/models/entity/yasu_ride/washstand.geo.json`)[
  "minecraft:geometry"
][0];
interface Cube {
  origin: number[];
  size: number[];
  uv: Record<string, { uv: number[]; uv_size: number[] }>;
}
interface Bone {
  name: string;
  parent?: string;
  pivot: number[];
  cubes?: Cube[];
}
const bones: Bone[] = geometry.bones;
const water = ["stream", "film", "foam", "splash", "foam_*", "splash_*"];
const animations = read(
  `${RP}/animations/yasu_ride/washstand.anim.json`,
).animations;
const run = animations["animation.yasu_ride.washstand.run"];

describe("Washstand assets (ADR 0246)", () => {
  it("cuts seven drain holes over a dark recess and leaves the rear deck behind the opening", () => {
    const png = readRgbaPng(`${RP}/textures/entity/yasu_ride/washstand.png`);
    const cube = (name: string) => {
      const c = bones.find((b) => b.name === name)?.cubes?.[0];
      if (!c) throw new Error(`Missing ${name} plate`);
      return c;
    };
    const texel = (c: Cube, x: number, z: number) => {
      const f = c.uv.up;
      if (!f) throw new Error("Missing top UV");
      const u = Math.floor(
        (f.uv[0] ?? 0) +
          ((x - (c.origin[0] ?? 0)) / (c.size[0] ?? 1)) * (f.uv_size[0] ?? 0),
      );
      // Bedrock top-face v points toward -z, so the deck hole must not be flipped.
      const v = Math.floor(
        (f.uv[1] ?? 0) +
          (1 - (z - (c.origin[2] ?? 0)) / (c.size[2] ?? 1)) *
            (f.uv_size[1] ?? 0),
      );
      return [
        ...png.pixels.subarray(
          (v * png.width + u) * 4,
          (v * png.width + u) * 4 + 4,
        ),
      ];
    };
    expect(texel(cube("deck"), 0, -1)[3]).toBe(0);
    expect(texel(cube("deck"), 0, 3.5)[3]).toBe(255);
    expect(texel(cube("floor"), 0, -1.05)).toEqual([13, 14, 15, 255]);
    const drain = cube("drain");
    expect(texel(drain, 0, -1.05)[3]).toBe(0);
    const f = drain.uv.up;
    if (!f) throw new Error("Missing drain UV");
    const width = f.uv_size[0] ?? 0;
    const height = f.uv_size[1] ?? 0;
    const remaining = new Set<number>();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const offset =
          (((f.uv[1] ?? 0) + y) * png.width + (f.uv[0] ?? 0) + x) * 4;
        if (png.pixels[offset + 3] === 0) remaining.add(y * width + x);
      }
    let components = 0;
    while (remaining.size) {
      const first = remaining.values().next().value;
      if (first === undefined) break;
      const queue = [first];
      remaining.delete(first);
      components++;
      for (const p of queue) {
        const x = p % width;
        const y = Math.floor(p / width);
        for (const [a, b] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ]) {
          if (
            a === undefined ||
            b === undefined ||
            a < 0 ||
            b < 0 ||
            a >= width ||
            b >= height
          )
            continue;
          const n = b * width + a;
          if (remaining.delete(n)) queue.push(n);
        }
      }
    }
    // Seven holes and one transparent region outside the circular flange.
    expect(components).toBe(8);
    for (const name of ["deck", "floor", "drain", "overflow"]) {
      for (const [side, uv] of Object.entries(cube(name).uv)) {
        if (side !== "up")
          expect(uv).toEqual({ uv: [0, 384], uv_size: [128, 128] });
      }
    }
  });
  it("provides persistent, damage-immune furniture without seats and synchronizes the show", () => {
    expect(entity.description).toEqual({
      identifier: FURNITURE_IDS.washstand.entity,
      is_spawnable: false,
      is_summonable: true,
      properties: {
        "yasu_ride:running": {
          type: "bool",
          default: false,
          client_sync: true,
        },
      },
    });
    const c = entity.components;
    expect(c["minecraft:rideable"]).toBeUndefined();
    expect(FURNITURE_SPEC.washstand.seats).toEqual([]);
    expect(bones.some((b) => b.name.startsWith("seat"))).toBe(false);
    expect(c["minecraft:type_family"].family).toEqual([
      "yasu_ride_washstand",
      "inanimate",
    ]);
    expect(c["minecraft:persistent"]).toEqual({});
    expect(c["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(c["minecraft:knockback_resistance"].value).toBe(1);
    expect(c["minecraft:damage_sensor"].triggers).toEqual({
      cause: "all",
      deals_damage: "no",
    });
    expect(c["minecraft:physics"]).toEqual({
      has_collision: true,
      has_gravity: true,
    });
    expect(c["minecraft:collision_box"]).toEqual({
      width: 0.65625,
      height: 1.25,
    });
  });

  it("covers the rotated model within a 16 by 10.5 by 20 px envelope and stays below the parasol budget", () => {
    const result = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `
import copy, json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('gen_washstand')
t = load_tool('cube_tilt')
bones = m.geometry()['minecraft:geometry'][0]['bones']
m.validate(bones)
parts = [c for b in bones if b['name'] not in m.WATER_BONES and b.get('parent') not in m.WATER_BONES for c in b.get('cubes', [])]
lo, hi = t.bounds(parts)
for axis in range(3):
    broken = copy.deepcopy(bones)
    broken[1]['cubes'][0]['size'][axis] += 100
    try:
        m.validate(broken)
    except ValueError:
        pass
    else:
        raise AssertionError('oversized model accepted')
print(json.dumps({'lo':lo, 'hi':hi, 'corners':[p for c in parts for p in t.corners(c)]}))
`,
        ],
        { encoding: "utf8" },
      ),
    );
    expect(result.lo).toEqual([-8, 0, -5.25]);
    expect(result.hi).toEqual([8, 19.94, 5.25]);
    const boxes = entity.components["minecraft:custom_hit_test"].hitboxes;
    expect(boxes).toEqual(
      [-0.171875, 0.171875].map((x) => ({
        width: 0.65625,
        height: 1.25,
        pivot: [x, 0.625, 0],
      })),
    );
    for (const point of result.corners as number[][]) {
      expect(
        boxes.some((b: { width: number; height: number; pivot: number[] }) =>
          point.every(
            (v, a) =>
              Math.abs(v / 16 - (b.pivot[a] ?? 0)) <=
              (a === 1 ? b.height : b.width) / 2 + 1e-6,
          ),
        ),
      ).toBe(true);
    }
    const count = (bs: Bone[]) =>
      bs.reduce((sum, b) => sum + (b.cubes?.length ?? 0), 0);
    const parasol = read(
      `${RP}/models/entity/yasu_ride/beach_parasol.geo.json`,
    )["minecraft:geometry"][0];
    expect(count(bones)).toBeLessThan(count(parasol.bones));
    expect(
      bones
        .find((b) => b.name === "tap")
        ?.cubes?.filter((c) => Math.abs((c.size[1] ?? 0) - 2.95) < 1e-6),
    ).toHaveLength(1);
    for (const name of ["drain", "overflow"])
      expect(bones.find((b) => b.name === name)?.cubes).toHaveLength(1);
  });

  it("binds hard-alpha body and translucent water separately, after every opaque bone", () => {
    expect(client.identifier).toBe(FURNITURE_IDS.washstand.entity);
    expect(client.geometry.default).toBe(geometry.description.identifier);
    expect(client.geometry.default).toBe("geometry.yasu_ride.washstand");
    expect(client.materials).toEqual({
      default: "entity_alphatest",
      water: "entity_alphablend",
    });
    expect(client.textures).toEqual({
      default: "textures/entity/yasu_ride/washstand",
      water: "textures/entity/yasu_ride/washstand_water",
    });
    const controllers = read(
      `${RP}/render_controllers/yasu_ride/washstand.rc.json`,
    ).render_controllers;
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.washstand",
      "controller.render.yasu_ride.washstand.water",
    ]);
    for (const name of client.render_controllers) {
      const rc = controllers[name];
      expect(rc.geometry).toBe("Geometry.default");
      expect(rc.materials).toEqual([
        { "*": "Material.default" },
        ...water.map((b) => ({ [b]: "Material.water" })),
      ]);
    }
    const body = controllers[client.render_controllers[0]];
    const wet = controllers[client.render_controllers[1]];
    expect(body.textures).toEqual(["Texture.default"]);
    expect(wet.textures).toEqual(["Texture.water"]);
    expect(body.part_visibility).toEqual([
      { "*": true },
      ...water.map((b) => ({ [b]: false })),
    ]);
    expect(wet.part_visibility).toEqual([
      { "*": false },
      ...water.map((b) => ({ [b]: "query.property('yasu_ride:running')" })),
    ]);
    for (const name of ["root", "drawer", "tap_lever", ...water.slice(0, 4)])
      expect(bones.some((b) => b.name === name)).toBe(true);
    const start = bones.findIndex((b) => b.name === "stream");
    expect(
      bones
        .slice(start)
        .every(
          (b) =>
            water.slice(0, 4).includes(b.name) ||
            water.includes(`${b.parent}_*`),
        ),
    ).toBe(true);
    for (const b of bones.slice(0, start)) expect(water).not.toContain(b.name);
    const texture = readRgbaPng(`${RP}/${client.textures.default}.png`);
    expect([texture.width, texture.height]).toEqual([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]);
    expect(new Set(texture.pixels.filter((_, i) => i % 4 === 3))).toEqual(
      new Set([0, 255]),
    );
    const wetTexture = readRgbaPng(`${RP}/${client.textures.water}.png`);
    expect(new Set(wetTexture.pixels.filter((_, i) => i % 4 === 3))).toEqual(
      new Set([0, 153, 217]),
    );
    for (const b of bones)
      for (const c of b.cubes ?? [])
        for (const f of Object.values(c.uv)) {
          expect(f.uv.every((v) => v >= 0)).toBe(true);
          expect(
            f.uv.every((v, i) => v + (f.uv_size[i] ?? 0) <= texture.width),
          ).toBe(true);
        }
  });

  it("runs for five seconds with a lifting lever, stream envelope, ten travelling foam bits and eight splashes", () => {
    expect(client.scripts.animate).toEqual(["show"]);
    expect(client.animations).toEqual({
      show: "controller.animation.yasu_ride.washstand",
      idle: "animation.yasu_ride.washstand.idle",
      run: "animation.yasu_ride.washstand.run",
    });
    const controller = read(
      `${RP}/animation_controllers/yasu_ride/washstand.ac.json`,
    ).animation_controllers[client.animations.show];
    expect(controller).toEqual({
      initial_state: "default",
      states: {
        default: {
          animations: ["idle"],
          transitions: [{ running: "query.property('yasu_ride:running')" }],
        },
        running: {
          animations: ["run"],
          transitions: [{ default: "!query.property('yasu_ride:running')" }],
        },
      },
    });
    expect(run.animation_length).toBe(5);
    expect(run.loop).toBe("hold_on_last_frame");
    expect(run.bones.tap_lever.rotation["0.15"][2]).toBeCloseTo(
      (0.45 * 180) / Math.PI,
    );
    expect(bones.find((b) => b.name === "tap_lever")?.pivot).toEqual([
      0, 19.46, 3.5,
    ]);
    expect(run.bones.tap_lever.rotation["5.0"]).toEqual([0, 0, 0]);
    for (const b of water.slice(0, 4)) {
      expect(animations[client.animations.idle].bones[b].scale).toEqual([
        0, 0, 0,
      ]);
      expect(run.bones[b].scale["0.0"]).toEqual([0, 0, 0]);
      expect(run.bones[b].scale["5.0"]).toEqual([0, 0, 0]);
    }
    for (const [prefix, count] of [
      ["foam", 10],
      ["splash", 8],
    ] as const) {
      const bits = bones.filter((b) => b.parent === prefix);
      expect(bits).toHaveLength(count);
      for (const b of bits) {
        const positions = (
          Object.values(run.bones[b.name].position) as number[][]
        ).map((p) => p.map((v, i) => v + (b.pivot[i] ?? 0)));
        expect(positions.every((p) => p.every(Number.isFinite))).toBe(true);
        if (prefix === "foam") {
          expect(Math.min(...positions.map((p) => p[1] ?? 0))).toBeCloseTo(
            13.61,
            2,
          );
          expect(Math.max(...positions.map((p) => p[2] ?? 0))).toBeCloseTo(
            1.45,
            2,
          );
          expect(
            positions.some((p) => Math.abs((p[2] ?? 0) + 1.05) < 0.001),
          ).toBe(true);
        } else
          expect(Math.max(...positions.map((p) => p[1] ?? 0))).toBeCloseTo(
            15.3,
            3,
          );
      }
    }
  });

  it("appends the last catalog member after the double sofa and binds item, recipe, names and previews", () => {
    const index = RESORT_GEAR.findIndex((p) => p.name === "washstand");
    expect(index).toBe(RESORT_GEAR.length - 1);
    expect(index).toBeGreaterThan(
      RESORT_GEAR.findIndex((p) => p.name === "sofa_double"),
    );
    expect(RESORT_GEAR[index]?.cutout).toBe(true);
    expect(
      JSON.stringify(read(`${BP}/item_catalog/crafting_item_catalog.json`)),
    ).toContain(RESORT_CATALOG_ITEMS_JSON);
    const item = read(`${BP}/items/yasu_ride/washstand_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(FURNITURE_IDS.washstand.item);
    expect(item.components).toEqual({
      "minecraft:icon": "yasu_ride_washstand",
      "minecraft:max_stack_size": 1,
      "minecraft:display_name": { value: "item.yasu_ride:washstand_item.name" },
    });
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data.yasu_ride_washstand,
    ).toEqual({ textures: "textures/items/yasu_ride/washstand_item" });
    const recipe = read(`${BP}/recipes/yasu_ride/washstand_item.recipe.json`)[
      "minecraft:recipe_shaped"
    ];
    expect(recipe.pattern).toEqual(["I I", "PQP", "III"]);
    expect(recipe.key).toEqual({
      I: { item: "minecraft:iron_ingot" },
      P: { tag: "minecraft:planks" },
      Q: { item: "minecraft:quartz" },
    });
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.result).toEqual({
      item: FURNITURE_IDS.washstand.item,
      count: 1,
    });
    const grids = (r: typeof recipe) => {
      const rows: string[][] = r.pattern.map((row: string) =>
        [...row].map((key) => JSON.stringify(r.key[key] ?? null)),
      );
      while (rows[0]?.every((v) => v === "null")) rows.shift();
      while (rows.at(-1)?.every((v) => v === "null")) rows.pop();
      while (rows.length && rows.every((r) => r[0] === "null"))
        for (const r of rows) r.shift();
      while (rows.length && rows.every((r) => r.at(-1) === "null"))
        for (const r of rows) r.pop();
      return [
        JSON.stringify(rows),
        JSON.stringify(rows.map((r) => [...r].reverse())),
      ];
    };
    for (const file of readdirSync(`${BP}/recipes`, { recursive: true })) {
      if (
        typeof file !== "string" ||
        !file.endsWith(".json") ||
        file.endsWith("/washstand_item.recipe.json")
      )
        continue;
      const other = read(`${BP}/recipes/${file}`)["minecraft:recipe_shaped"];
      if (other)
        for (const grid of grids(other))
          expect(grids(recipe), file).not.toContain(grid);
    }
    for (const [locale, name] of [
      ["en_US", "Washstand"],
      ["ja_JP", "\u6d17\u9762\u53f0"],
    ]) {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const prefix of [
        "item.yasu_ride:washstand_item",
        "entity.yasu_ride:washstand",
      ])
        expect(lang).toContain(`${prefix}.name=${name}\n`);
    }
    for (const [path, size] of [
      ["docs/images/items/camping-gear/washstand.png", 128],
      [`${RP}/textures/items/yasu_ride/washstand_item.png`, 32],
    ] as const) {
      const png = readRgbaPng(path);
      expect([png.width, png.height]).toEqual([size, size]);
      expect(png.pixels[3]).toBe(0);
      expect(png.pixels.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    }
  });
});
