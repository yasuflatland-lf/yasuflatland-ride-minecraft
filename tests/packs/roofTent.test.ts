import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import {
  ROOF_TENT_FAMILY,
  ROOF_TENT_FLAP_OPEN_PROPERTY,
  ROOF_TENT_ITEM,
  ROOF_TENT_LADDER_PROPERTY,
  ROOF_TENT_OCCUPIED_PROPERTY,
  ROOF_TENT_TYPE,
} from "../../src/infrastructure/camp/identifiers";
import { PACK_STEM_TAGS } from "../../src/test-pack/impact";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";
import { assertOneAxis } from "./oneAxis";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const entity = read(`${BP}/entities/yasu_ride/roof_tent.se.json`)[
  "minecraft:entity"
];
const client = read(`${RP}/entity/yasu_ride/roof_tent.ce.json`)[
  "minecraft:client_entity"
].description;
const geometry = read(`${RP}/models/entity/yasu_ride/roof_tent.geo.json`)[
  "minecraft:geometry"
][0];
type TexturedBone = Omit<Bone, "cubes"> & {
  cubes?: (NonNullable<Bone["cubes"]>[number] & {
    uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
  })[];
};
const bones: TexturedBone[] = geometry.bones;

describe("roof tent asset contract", () => {
  it("declares stable identifiers, synced flags, fixed collision, and damage immunity", () => {
    expect(ROOF_TENT_TYPE).toBe("yasu_ride:roof_tent");
    expect(ROOF_TENT_ITEM).toBe("yasu_ride:roof_tent_item");
    expect(entity.description).toEqual({
      identifier: ROOF_TENT_TYPE,
      is_spawnable: false,
      is_summonable: true,
      properties: Object.fromEntries(
        [
          ROOF_TENT_LADDER_PROPERTY,
          ROOF_TENT_FLAP_OPEN_PROPERTY,
          ROOF_TENT_OCCUPIED_PROPERTY,
        ].map((p) => [p, { type: "bool", default: false, client_sync: true }]),
      ),
    });
    expect([
      ROOF_TENT_LADDER_PROPERTY,
      ROOF_TENT_FLAP_OPEN_PROPERTY,
      ROOF_TENT_OCCUPIED_PROPERTY,
    ]).toEqual([
      "yasu_ride:ladder",
      "yasu_ride:flap_open",
      "yasu_ride:occupied",
    ]);
    expect(entity.components["minecraft:type_family"].family).toEqual([
      ROOF_TENT_FAMILY,
      "inanimate",
    ]);
    expect(ROOF_TENT_FAMILY).toBe("yasu_ride:roof_tent");
    expect(entity.components["minecraft:collision_box"]).toEqual({
      width: 2,
      height: 1.2,
    });
    expect(entity.components["minecraft:physics"]).toEqual({
      has_collision: false,
      has_gravity: false,
    });
    const tent = read(`${BP}/entities/yasu_ride/tent.se.json`)[
      "minecraft:entity"
    ];
    expect(entity.components["minecraft:damage_sensor"]).toEqual(
      tent.components["minecraft:damage_sensor"],
    );
    expect(entity.components["minecraft:pushable"]).toEqual(
      tent.components["minecraft:pushable"],
    );
    expect(entity.components["minecraft:persistent"]).toEqual({});
  });

  it("switches every paint variant in shared PAINTS order", () => {
    expect(entity.components["minecraft:variant"]).toEqual({ value: 0 });
    const groups = PAINTS.map((paint) => `yasu_ride:paint_${paint}`);
    expect(Object.keys(entity.component_groups)).toEqual(groups);
    expect(Object.keys(entity.events)).toEqual(groups);
    for (const [index, group] of groups.entries()) {
      expect(entity.component_groups[group]).toEqual({
        "minecraft:variant": { value: index },
      });
      expect(entity.events[group]).toEqual({
        add: { component_groups: [group] },
        remove: { component_groups: groups.filter((g) => g !== group) },
      });
    }
  });

  it("selects paint textures, blends mesh, hides the ladder, and rolls the entrance flap", () => {
    expect(client.identifier).toBe(ROOF_TENT_TYPE);
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.roof_tent",
    });
    expect(client.materials).toEqual({ default: "entity_alphablend" });
    expect(client.textures).toEqual(
      Object.fromEntries(
        PAINTS.map((p) => [
          p === "khaki" ? "default" : p,
          `textures/entity/yasu_ride/roof_tent${p === "khaki" ? "" : `_${p}`}`,
        ]),
      ),
    );
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.roof_tent",
    ]);
    const controller = read(
      `${RP}/render_controllers/yasu_ride/roof_tent.rc.json`,
    ).render_controllers[client.render_controllers[0]];
    expect(controller).toEqual({
      arrays: {
        textures: {
          "Array.paints": PAINTS.map(
            (p) => `Texture.${p === "khaki" ? "default" : p}`,
          ),
        },
      },
      geometry: "Geometry.default",
      materials: [{ "*": "Material.default" }],
      textures: ["Array.paints[query.variant]"],
      part_visibility: [{ ladder: "query.property('yasu_ride:ladder')" }],
    });
    expect(client.animations).toEqual({
      flap: "animation.yasu_ride.roof_tent.flap",
    });
    expect(client.scripts).toEqual({ animate: ["flap"] });
    expect(
      read(`${RP}/animations/yasu_ride/roof_tent.anim.json`).animations,
    ).toEqual({
      "animation.yasu_ride.roof_tent.flap": {
        loop: true,
        bones: {
          flap: {
            scale: [1, "q.property('yasu_ride:flap_open') ? 0.125 : 1", 1],
          },
        },
      },
    });
  });

  it("keeps six named bones, a sloped shell, front flap, interior bedding, and single-axis turns", () => {
    expect(bones.map((b) => b.name)).toEqual([
      "root",
      "body",
      "fabric",
      "flap",
      "sleeping_bag",
      "ladder",
    ]);
    expect(bones.find((b) => b.name === "root")?.parent).toBeUndefined();
    expect(bones.find((b) => b.name === "body")?.parent).toBe("root");
    expect(bones.find((b) => b.name === "flap")?.pivot).toEqual([0, 12, -20]);
    assertOneAxis(
      bones.flatMap((b) => b.cubes ?? []),
      {},
    );
    for (const bone of bones) {
      for (const cube of bone.cubes ?? []) {
        for (const [x, y, z] of turnedCorners(bone, cube)) {
          expect(x).toBeGreaterThanOrEqual(-17);
          expect(x).toBeLessThanOrEqual(17);
          expect(y).toBeGreaterThanOrEqual(bone.name === "ladder" ? -33 : 0);
          expect(y).toBeLessThanOrEqual(20);
          expect(z).toBeGreaterThanOrEqual(-31);
          expect(z).toBeLessThanOrEqual(20);
          if (bone.name === "sleeping_bag") {
            expect(Math.abs(x)).toBeLessThan(15);
            expect(y).toBeGreaterThanOrEqual(2);
            expect(y).toBeLessThanOrEqual(5);
            expect(Math.abs(z)).toBeLessThan(19);
          }
        }
        for (const face of Object.values(cube.uv)) {
          expect(face.uv_size).toEqual([4, 4]);
          const [u, v] = face.uv;
          const slot = u / 4 + v;
          if (slot < 2) expect(["fabric", "flap"]).toContain(bone.name);
        }
      }
    }
    const shell = bones.find((b) => b.name === "fabric");
    expect(shell?.cubes?.filter((c) => c.rotation?.[2]).length).toBe(2);
    const mesh = shell?.cubes?.filter((c) =>
      Object.values(c.uv).every((f) => f.uv[0] === 4 && f.uv[1] === 8),
    );
    expect(mesh).toHaveLength(2);
  });

  it("ships all sixteen paints and recolors only fabric swatches", () => {
    const folder = `${RP}/textures/entity/yasu_ride`;
    const names = PAINTS.map(
      (p) => `roof_tent${p === "khaki" ? "" : `_${p}`}.png`,
    );
    expect(
      readdirSync(folder)
        .filter((f) => /^roof_tent(?:_\w+)?\.png$/.test(f))
        .sort(),
    ).toEqual([...names].sort());
    for (const [index, name] of names.entries()) {
      const texture = readRgbaPng(`${folder}/${name}`);
      const ground = readRgbaPng(`${folder}/${name.replace("roof_", "")}`);
      const base = readRgbaPng(`${folder}/roof_tent.png`);
      expect([texture.width, texture.height]).toEqual([
        geometry.description.texture_width,
        geometry.description.texture_height,
      ]);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const start = (y * 16 + x) * 4;
          const pixel = texture.pixels.subarray(start, start + 4);
          const slot = Math.floor(y / 4) * 4 + Math.floor(x / 4);
          if (slot < 2) {
            expect(pixel).toEqual(ground.pixels.subarray(start, start + 4));
            if (index > 0)
              expect(pixel).not.toEqual(base.pixels.subarray(start, start + 4));
          } else expect(pixel).toEqual(base.pixels.subarray(start, start + 4));
          if (slot === 9) {
            expect(pixel[3]).toBeGreaterThan(0);
            expect(pixel[3]).toBeLessThan(255);
          }
        }
    }
  });

  it("ships a single starter item without a recipe, with generated icon and preview", () => {
    const item = read(`${BP}/items/yasu_ride/roof_tent_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description).toEqual({
      identifier: ROOF_TENT_ITEM,
      menu_category: { category: "items" },
    });
    expect(item.components).toEqual({
      "minecraft:icon": "yasu_ride_roof_tent_item",
      "minecraft:max_stack_size": 1,
      "minecraft:display_name": { value: "item.yasu_ride:roof_tent_item.name" },
    });
    expect(
      existsSync(`${BP}/recipes/yasu_ride/roof_tent_item.recipe.json`),
    ).toBe(false);
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data
        .yasu_ride_roof_tent_item,
    ).toEqual({ textures: "textures/items/yasu_ride/roof_tent_item" });
    for (const [path, size] of [
      [`${RP}/textures/items/yasu_ride/roof_tent_item.png`, 32],
      ["docs/images/items/camping-gear/roof_tent.png", 128],
    ] as const) {
      const image = readRgbaPng(path);
      expect([image.width, image.height]).toEqual([size, size]);
    }
    for (const stem of ["roof_tent", "roof_tent_item"]) {
      expect(PACK_STEM_TAGS[stem]).toEqual([
        "camp",
        "vehicle:suv",
        "vehicle:camper",
      ]);
    }
  });
});
