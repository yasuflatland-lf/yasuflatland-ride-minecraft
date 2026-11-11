import { existsSync, readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FURNITURE_SPEC } from "../../src/domain/resort/furniture";
import { FURNITURE_IDS } from "../../src/infrastructure/resort/identifiers";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";
import { assertOneAxis } from "./oneAxis";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const entityFile = read(`${BP}/entities/yasu_ride/toilet.se.json`);
const entity = entityFile["minecraft:entity"];
const model = read(`${RP}/models/entity/yasu_ride/toilet.geo.json`)[
  "minecraft:geometry"
][0];
const bones = model.bones as Bone[];
const animations = read(
  `${RP}/animations/yasu_ride/toilet.anim.json`,
).animations;
const animation = (name: string) =>
  animations[`animation.yasu_ride.toilet.${name}`];
const client = read(`${RP}/entity/yasu_ride/toilet.ce.json`)[
  "minecraft:client_entity"
].description;
const ids = FURNITURE_IDS.toilet;
const cubes = bones.flatMap((b) => b.cubes ?? []);
const points = bones
  .filter((b) => !b.name.startsWith("swirl_") && !b.name.startsWith("rim_jet_"))
  .flatMap((b) => (b.cubes ?? []).flatMap((c) => turnedCorners(b, c)));
const bounds = [0, 1, 2].map((axis) => [
  Math.min(...points.map((p) => p[axis] ?? 0)),
  Math.max(...points.map((p) => p[axis] ?? 0)),
]);

function evaluate(value: string | number, time: number): number {
  if (typeof value === "number") return value;
  return runInNewContext(value, {
    query: { anim_time: time },
    math: {
      clamp: (x: number, a: number, b: number) => Math.max(a, Math.min(b, x)),
      cos: (x: number) => Math.cos((x * Math.PI) / 180),
      sin: (x: number) => Math.sin((x * Math.PI) / 180),
      mod: (x: number, y: number) => x % y,
    },
  });
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);
function waterOffset(t: number) {
  if (t < 0.3) return 0;
  if (t < 1) return 1.5 * ease((t - 0.3) / 0.7);
  if (t < 1.8) return 1.5;
  if (t < 3.6) return 1.5 - 1.75 * ease((t - 1.8) / 1.8);
  return -0.25 + 0.25 * ease(clamp((t - 3.6) / 1.4));
}

describe("Toilet pack contract", () => {
  it("is persistent, immovable and immune with one domain seat and synchronized show properties", () => {
    expect(entityFile.format_version).toBe("1.21.80");
    expect(entity.description).toEqual({
      identifier: ids.entity,
      is_spawnable: false,
      is_summonable: true,
      properties: Object.fromEntries(
        ["lid_open", "flushing"].map((p) => [
          `yasu_ride:${p}`,
          { type: "bool", default: false, client_sync: true },
        ]),
      ),
    });
    const c = entity.components;
    expect(c["minecraft:type_family"].family).toEqual([
      "yasu_ride_toilet",
      "inanimate",
    ]);
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
    expect(c["minecraft:rideable"]).toEqual({
      seat_count: 1,
      family_types: ["player"],
      interact_text: "action.interact.yasu_ride.sit",
      crouching_skip_interact: true,
      seats: FURNITURE_SPEC.toilet.seats.map(({ x, y, z }) => ({
        position: [x, y, z],
      })),
    });
    const seat = bones
      .find((b) => b.name === "seat")
      ?.cubes?.find((c) => !c.rotation);
    expect(seat).toBeDefined();
    const top = (seat?.origin[1] ?? 0) + (seat?.size[1] ?? 0);
    expect(top).toBeCloseTo(8.06, 6);
    expect(FURNITURE_SPEC.toilet.seats[0]?.y).toBeCloseTo(top / 16 - 0.24, 3);
  });

  it("covers every turned corner with its hitbox and stays inside one cell", () => {
    const c = entity.components;
    expect(c["minecraft:collision_box"].width).toBeLessThanOrEqual(1);
    expect(c["minecraft:collision_box"].height).toBeLessThanOrEqual(1);
    const hit = c["minecraft:custom_hit_test"].hitboxes[0];
    fc.assert(
      fc.property(fc.integer({ min: 0, max: points.length - 1 }), (i) => {
        const point = points[i];
        if (!point) throw new Error("Missing corner");
        for (const axis of [0, 2]) {
          expect(Math.abs(point[axis] ?? 0)).toBeLessThan(8);
          expect(
            Math.abs((point[axis] ?? 0) / 16 - hit.pivot[axis]),
          ).toBeLessThanOrEqual(hit.width / 2 + 1e-6);
        }
        expect(point[1]).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.abs(point[1] / 16 - hit.pivot[1])).toBeLessThanOrEqual(
          hit.height / 2 + 1e-6,
        );
      }),
      { numRuns: 200 },
    );
    for (const point of points) {
      expect(point[1] / 16).toBeLessThanOrEqual(hit.pivot[1] + hit.height / 2);
      expect(Math.abs(point[0] / 16)).toBeLessThanOrEqual(hit.width / 2);
      expect(Math.abs(point[2] / 16)).toBeLessThanOrEqual(hit.width / 2);
    }
    expect(bounds[1]?.[0]).toBeCloseTo(0, 5);
    expect(bounds[1]?.[1]).toBeCloseTo(17, 1);
    expect((bounds[2]?.[1] ?? 0) - (bounds[2]?.[0] ?? 0)).toBeCloseTo(14.2, 0);
    const cap = bones.find((b) => b.name === "cap");
    const capPoints = cap?.cubes?.flatMap((c) => turnedCorners(cap, c)) ?? [];
    expect(
      Math.max(...capPoints.map((p) => p[0])) -
        Math.min(...capPoints.map((p) => p[0])),
    ).toBeCloseTo(7.4, 0);
    const lever = bones.find((b) => b.name === "lever");
    expect(
      lever?.cubes?.every((c) =>
        turnedCorners(lever, c).every((p) => p[0] > 0),
      ),
    ).toBe(true);
  });

  it("keeps the hinged lid, independently animated foam, registered panels and water-last material contract", () => {
    for (const name of [
      "root",
      "lid",
      "water",
      "swirl",
      "rim_jets",
      ...Array.from({ length: 16 }, (_, i) => `swirl_${i}`),
      ...Array.from({ length: 6 }, (_, i) => `rim_jet_${i}`),
    ])
      expect(bones.some((b) => b.name === name)).toBe(true);
    const hinge = bones.find((b) => b.name === "lid")?.pivot;
    expect(hinge?.[0]).toBe(0);
    expect(hinge?.[1]).toBeCloseTo(8.99, 6);
    expect(hinge?.[2]).toBeCloseTo(1.705, 6);
    expect(bones.at(-1)?.name).toBe("water");
    const opaque = bones.slice(0, -1).flatMap((b) => b.cubes ?? []);
    const assemblies = Object.fromEntries(
      ["body", "interior", "seat", "shelf", "tank", "cap", "lid"].map(
        (name) => [name, bones.find((b) => b.name === name)?.cubes ?? []],
      ),
    );
    assertOneAxis(opaque, assemblies);
    const parasol = read(
      `${RP}/models/entity/yasu_ride/beach_parasol.geo.json`,
    )["minecraft:geometry"][0];
    expect(cubes.length).toBe(369);
    expect(cubes.length).toBeLessThan(
      parasol.bones.flatMap((b: Bone) => b.cubes ?? []).length,
    );
    expect(client.identifier).toBe(ids.entity);
    expect(client.geometry.default).toBe(model.description.identifier);
    expect(client.materials).toEqual({
      default: "entity_alphatest",
      water: "entity_alphablend",
    });
    expect(client.textures.default).toBe("textures/entity/yasu_ride/toilet");
    expect(
      read(`${RP}/render_controllers/yasu_ride/toilet.rc.json`)
        .render_controllers[client.render_controllers[0]],
    ).toEqual({
      geometry: "Geometry.default",
      materials: [{ "*": "Material.default" }, { water: "Material.water" }],
      textures: ["Texture.default"],
    });
    const png = readRgbaPng(`${RP}/${client.textures.default}.png`);
    expect([png.width, png.height]).toEqual([
      model.description.texture_width,
      model.description.texture_height,
    ]);
  });

  it("wires property-driven lid and flush controllers with silent idle foam", () => {
    const controllers = read(
      `${RP}/animation_controllers/yasu_ride/toilet.ac.json`,
    ).animation_controllers;
    expect(client.scripts.animate).toEqual(["lid", "flushing"]);
    for (const name of ["lid", "flushing"])
      expect(controllers[client.animations[name]]).toBeDefined();
    for (const [name, property] of [
      ["lid", "lid_open"],
      ["flush", "flushing"],
    ]) {
      const controller =
        controllers[`controller.animation.yasu_ride.toilet.${name}`];
      expect(JSON.stringify(controller)).toContain(
        `query.property('yasu_ride:${property}')`,
      );
      expect(JSON.stringify(controller)).toContain(
        `!query.property('yasu_ride:${property}')`,
      );
      for (const state of Object.values(controller.states) as {
        animations?: string[];
      }[])
        for (const name of state.animations ?? [])
          expect(animations[client.animations[name]]).toBeDefined();
    }
    for (const [name, start, end] of [
      ["open", 0, -91],
      ["close", -91, 0],
    ] as const) {
      expect(animation(`lid_${name}`)).toEqual({
        loop: "hold_on_last_frame",
        animation_length: 0.4,
        bones: {
          lid: { rotation: { "0.0": [start, 0, 0], "0.4": [end, 0, 0] } },
        },
      });
    }
    expect(animation("flush").animation_length).toBe(5);
    expect(animation("rest").bones).toEqual({
      swirl: { scale: [0, 0, 0] },
      rim_jets: { scale: [0, 0, 0] },
      water: { position: [0, 0, 0], scale: [1, 1, 1] },
    });
    const initial = controllers[client.animations.lid].states.initial;
    expect(initial.animations).toEqual(["closed_pose"]);
  });

  it("matches the reference water, shrinking orbit and phased rim jets throughout the five-second show", () => {
    const flush = animation("flush").bones;
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.integer({ min: 0, max: 15 }),
        (t, i) => {
          const offset = waterOffset(t),
            p = clamp((t - 0.2) / 3.4),
            angle = t * 9 + (i * Math.PI * 2) / 16;
          const fade = ease(clamp(t / 0.4)) * (1 - ease(clamp((t - 3.3) / 1)));
          expect(evaluate(flush.water.position[1], t)).toBeCloseTo(
            offset * 0.775,
            8,
          );
          expect(evaluate(flush.water.scale[0], t)).toBeCloseTo(
            1 + 0.45 * clamp(offset / 1.5),
            8,
          );
          expect(evaluate(flush.water.scale[2], t)).toBeCloseTo(
            1 + 0.45 * clamp(offset / 1.5),
            8,
          );
          const bit = flush[`swirl_${i}`];
          const expected = [
            -0.775 * 2 * (1 - 0.85 * p) * Math.cos(angle),
            0.775 * (5.1 + offset + 0.25 + (i % 4) * 0.4 + 2 * (1 - p)),
            0.775 * (-2.6 + 3 * (1 - 0.85 * p) * Math.sin(angle)),
          ];
          bit.position.forEach((v: string | number, axis: number) => {
            expect(evaluate(v, t)).toBeCloseTo(expected[axis] ?? 0, 7);
          });
          expect(evaluate(bit.scale, t)).toBeCloseTo(fade, 8);
          const j = i % 6,
            k = (t * 3 + j / 6) % 1,
            jet = flush[`rim_jet_${j}`];
          expect(evaluate(jet.position[0], t)).toBeCloseTo(
            -0.775 * (-2 + j * 0.8),
            8,
          );
          expect(evaluate(jet.position[1], t)).toBeCloseTo(
            0.775 * (10 - 2.8 * k),
            8,
          );
          expect(evaluate(jet.position[2], t)).toBeCloseTo(
            0.775 * (-0.4 - 0.3 * k),
            8,
          );
          expect(evaluate(jet.scale, t)).toBeCloseTo(
            t < 1.6 ? 1 - 0.5 * k : 0,
            8,
          );
        },
      ),
      { numRuns: 40 },
    );
    for (const [t, offset] of [
      [0, 0],
      [0.3, 0],
      [1, 1.5],
      [1.8, 1.5],
      [3.6, -0.25],
      [5, 0],
    ])
      expect(evaluate(flush.water.position[1], t ?? 0)).toBeCloseTo(
        (offset ?? 0) * 0.775,
        8,
      );
    for (let i = 0; i < 16; i++)
      expect(evaluate(flush[`swirl_${i}`].scale, 5)).toBe(0);
  });

  it("binds the item, unique mirrored recipe, ordered catalog, texture and previews", () => {
    const item = read(`${BP}/items/yasu_ride/toilet_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description.identifier).toBe(ids.item);
    expect(item.components).toEqual({
      "minecraft:icon": "yasu_ride_toilet",
      "minecraft:max_stack_size": 1,
      "minecraft:display_name": { value: "item.yasu_ride:toilet_item.name" },
    });
    const recipe = read(`${BP}/recipes/yasu_ride/toilet_item.recipe.json`)[
      "minecraft:recipe_shaped"
    ];
    expect(recipe.description.identifier).toBe(ids.item);
    expect(recipe.tags).toEqual(["crafting_table"]);
    expect(recipe.result).toEqual({ item: ids.item, count: 1 });
    expect(recipe.pattern).toEqual(["QIQ", "Q Q", " Q "]);
    expect(recipe.key).toEqual({
      Q: { item: "minecraft:quartz" },
      I: { item: "minecraft:iron_ingot" },
    });
    const signature = (r: typeof recipe, mirror = false) =>
      r.pattern
        .map((row: string) => {
          const keys = [...row];
          if (mirror) keys.reverse();
          return keys.map((k) => JSON.stringify(r.key[k] ?? null)).join(",");
        })
        .join(";");
    for (const file of readdirSync(`${BP}/recipes`, {
      recursive: true,
      encoding: "utf8",
    })) {
      if (!file.endsWith(".json") || file.endsWith("toilet_item.recipe.json"))
        continue;
      const other = read(`${BP}/recipes/${file}`)["minecraft:recipe_shaped"];
      if (other)
        for (const mirror of [false, true])
          expect(signature(other, mirror), file).not.toBe(signature(recipe));
    }
    const gear: { name: string }[] = read("tools/resort_gear.json");
    const at = gear.findIndex((piece) => piece.name === "toilet");
    expect(gear[at]).toEqual({
      name: "toilet",
      item: "toilet_item",
      geometry: "toilet",
      textured: true,
      cutout: true,
    });
    expect(gear[at - 1]?.name).toBe("sofa_double");
    const groups = read(`${BP}/item_catalog/crafting_item_catalog.json`)[
      "minecraft:crafting_items_catalog"
    ].categories[0].groups;
    const group = groups.find(
      (g: { group_identifier: { name: string } }) =>
        g.group_identifier.name === "yasu_ride:resort_gear",
    );
    expect(group.items.indexOf(ids.item)).toBe(
      group.items.indexOf("yasu_ride:sofa_double_item") + 1,
    );
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data.yasu_ride_toilet,
    ).toEqual({ textures: "textures/items/yasu_ride/toilet_item" });
    for (const [path, size] of [
      [`${RP}/textures/items/yasu_ride/toilet_item.png`, 32],
      ["docs/images/items/camping-gear/toilet.png", 128],
    ] as const) {
      expect(existsSync(path)).toBe(true);
      const png = readRgbaPng(path);
      expect([png.width, png.height]).toEqual([size, size]);
      expect(png.pixels.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
    }
    for (const locale of ["en_US", "ja_JP"]) {
      const lang = readFileSync(`${RP}/texts/${locale}.lang`, "utf8");
      for (const key of [
        "item.yasu_ride:toilet_item.name",
        "entity.yasu_ride:toilet.name",
        "yasu_ride.toilet.occupied",
        "yasu_ride.toilet.flushing",
      ])
        expect(
          lang
            .split("\n")
            .some(
              (line) =>
                line.startsWith(`${key}=`) && line.length > key.length + 1,
            ),
        ).toBe(true);
      if (locale === "en_US")
        expect(lang).toContain("item.yasu_ride:toilet_item.name=Toilet\n");
    }
  });
});
