import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";
import { assertOneAxis } from "./oneAxis";

const bp = "packs/yasu_ride_bp";
const rp = "packs/yasu_ride_rp";
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

type Triple = [number, number, number];
type Cube = {
  origin: Triple;
  size: Triple;
  pivot?: Triple;
  rotation?: Triple;
  uv: Record<string, { uv: [number, number] }>;
};
type GasBone = Omit<Bone, "cubes"> & { cubes?: Cube[] };

const geometry = readJson(`${rp}/models/entity/yasu_ride/gas_lantern.geo.json`)[
  "minecraft:geometry"
][0];
const bones: GasBone[] = geometry.bones;
const bone = (name: string) => {
  const found = bones.find((b) => b.name === name);
  if (!found) throw new Error(`no bone ${name}`);
  return found;
};
const allCubes = bones.flatMap((b) => b.cubes ?? []);
const swatchOf = (cube: Cube) =>
  new Set(
    Object.values(cube.uv).map(
      ({ uv }) => Math.floor(uv[1] / 8) * 4 + Math.floor(uv[0] / 8),
    ),
  );
const swatchesOf = (name: string) =>
  new Set((bone(name).cubes ?? []).flatMap((c) => [...swatchOf(c)]));

function swatchPixels(png: ReturnType<typeof readRgbaPng>, slot: number) {
  const out: number[][] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const px = (slot % 4) * 8 + x;
      const py = Math.floor(slot / 4) * 8 + y;
      const start = (py * png.width + px) * 4;
      out.push([...png.pixels.subarray(start, start + 4)]);
    }
  return out;
}

describe("Gas Lantern model", () => {
  it("has the four bones, their parents, and the shipped cube counts", () => {
    expect(geometry.description.identifier).toBe(
      "geometry.yasu_ride.gas_lantern",
    );
    expect(geometry.description.texture_width).toBe(32);
    expect(geometry.description.texture_height).toBe(32);
    expect(bones.map((b) => [b.name, b.parent])).toEqual([
      ["root", undefined],
      ["body", "root"],
      ["glass", "body"],
      ["flame", "body"],
    ]);
    expect(bone("root").pivot).toEqual([0, 0, 0]);
    expect(bone("body").cubes).toHaveLength(204);
    expect(bone("glass").cubes).toHaveLength(16);
    expect(bone("flame").cubes).toHaveLength(4);
  });

  it("turns no cube about more than one axis and gives every cube a positive size", () => {
    expect(() => assertOneAxis(allCubes, {})).not.toThrow();
    for (const cube of allCubes)
      for (const s of cube.size) expect(s).toBeGreaterThan(0);
  });

  it("stays within the bounds of ADR 0173 rule 14", () => {
    const points = bones.flatMap((b) =>
      (b.cubes ?? []).flatMap((c) => turnedCorners(b, c)),
    );
    const range = (axis: number) => [
      Math.min(...points.map((p) => p[axis] as number)),
      Math.max(...points.map((p) => p[axis] as number)),
    ];
    const [x0, x1] = range(0);
    const [y0, y1] = range(1);
    const [z0, z1] = range(2);
    expect(x0).toBeGreaterThanOrEqual(-3.1);
    expect(x1).toBeLessThanOrEqual(3.75);
    expect(z0).toBeGreaterThanOrEqual(-3.1);
    expect(z1).toBeLessThanOrEqual(3.1);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(y1).toBeLessThanOrEqual(11.3);
  });

  it("turns the two handle arms with opposite signs and keeps their outer ends on the cross bar", () => {
    const body = bone("body");
    const arms = (body.cubes ?? []).filter(
      (c) => c.origin[1] === 6 && c.rotation?.some((a) => a !== 0),
    );
    expect(arms).toHaveLength(2);
    const [minus, plus] = [...arms].sort(
      (a, b) => (a.pivot?.[2] ?? 0) - (b.pivot?.[2] ?? 0),
    );
    expect(minus?.pivot?.[2]).toBeLessThan(0);
    expect(minus?.rotation?.[1]).toBeLessThan(0);
    expect(plus?.rotation?.[1]).toBeGreaterThan(0);
    expect(minus?.rotation?.[1]).toBeCloseTo(-(plus?.rotation?.[1] ?? 0), 6);
    for (const arm of arms) {
      const corners = turnedCorners(body, arm);
      const far = Math.max(...corners.map((p) => p[0]));
      for (const p of corners.filter((c) => c[0] > far - 0.5)) {
        expect(p[2]).toBeGreaterThanOrEqual(-0.6);
        expect(p[2]).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it("closes the glass ring and narrows the shoulder with height", () => {
    const glass = bone("glass").cubes ?? [];
    const apothem = (c: Cube) => -c.origin[2];
    for (const c of glass) expect(apothem(c)).toBeCloseTo(1.5, 2);
    expect(
      glass.map((c) => c.rotation?.[1] ?? 0).sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 16 }, (_, k) => k * 22.5));
    const rings = new Map<number, number>();
    for (const c of bone("body").cubes ?? []) {
      if (c.origin[1] >= 3.5 && c.origin[1] < 4.9 && c.size[1] > 0.2) {
        const a = apothem(c);
        if (c.rotation?.[1] === 0 && a > 0)
          rings.set(c.origin[1], Math.max(rings.get(c.origin[1]) ?? 0, a));
      }
    }
    const apothems = [...rings.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, a]) => a);
    expect(apothems.length).toBeGreaterThan(3);
    for (let i = 1; i < apothems.length; i++)
      expect(apothems[i]).toBeLessThan(apothems[i - 1] as number);
  });

  it("uses the glass and flame swatches only on their own bones", () => {
    expect(swatchesOf("glass")).toEqual(new Set([6]));
    expect(swatchesOf("flame")).toEqual(new Set([7]));
    const body = swatchesOf("body");
    expect(body.has(6)).toBe(false);
    expect(body.has(7)).toBe(false);
  });
});

describe("Gas Lantern textures and pack files", () => {
  const color = readRgbaPng(`${rp}/textures/entity/yasu_ride/gas_lantern.png`);
  const mer = readRgbaPng(
    `${rp}/textures/entity/yasu_ride/gas_lantern_mer.png`,
  );

  it("has a flat 32 x 32 RGBA atlas with glass alpha 96 and flame alpha 0", () => {
    expect([color.width, color.height]).toEqual([32, 32]);
    for (let slot = 0; slot < 16; slot++) {
      const texels = swatchPixels(color, slot);
      expect(new Set(texels.map((t) => t.join())).size).toBe(1);
      const alpha: Record<number, number> = { 6: 96, 7: 0 };
      expect(texels[0]?.[3]).toBe(alpha[slot] ?? 255);
    }
  });

  it("is emissive only in the flame swatch", () => {
    for (let slot = 0; slot < 16; slot++)
      for (const t of swatchPixels(mer, slot))
        expect(t[1] === 255).toBe(slot === 7);
  });

  it("ships the texture set, client entity, render controller, and matching versions", () => {
    expect(
      readJson(`${rp}/textures/entity/yasu_ride/gas_lantern.texture_set.json`),
    ).toEqual({
      format_version: "1.16.100",
      "minecraft:texture_set": {
        color: "gas_lantern",
        metalness_emissive_roughness: "gas_lantern_mer",
      },
    });
    const client = readJson(`${rp}/entity/yasu_ride/gas_lantern.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.identifier).toBe("yasu_ride:gas_lantern");
    expect(client.materials).toEqual({
      default: "entity",
      glass: "entity_alphablend",
      flame: "entity_emissive",
    });
    expect(client.textures.default).toBe(
      "textures/entity/yasu_ride/gas_lantern",
    );
    expect(client.geometry.default).toBe("geometry.yasu_ride.gas_lantern");
    const controller = readJson(
      `${rp}/render_controllers/yasu_ride/gas_lantern.rc.json`,
    ).render_controllers[client.render_controllers[0]];
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.gas_lantern",
    ]);
    expect(controller.materials).toEqual([
      { "*": "Material.default" },
      { glass: "Material.glass" },
      { flame: "Material.flame" },
    ]);
    expect(controller.part_visibility).toEqual([
      { flame: "query.property('yasu_ride:lit')" },
    ]);
    const rpManifest = readJson(`${rp}/manifest.json`);
    expect(rpManifest.header.version).toEqual([0, 1, 196]);
    const dependency = readJson(`${bp}/manifest.json`).dependencies.find(
      (d: { uuid: string }) => d.uuid === rpManifest.header.uuid,
    );
    expect(dependency.version).toEqual(rpManifest.header.version);
  });
});

describe("Gas Lantern item and ground entity", () => {
  it("stands under gravity, stays off, and offers an inert interact button", () => {
    const entity = readJson(`${bp}/entities/yasu_ride/gas_lantern.se.json`)[
      "minecraft:entity"
    ];
    expect(entity.description).toEqual({
      identifier: "yasu_ride:gas_lantern",
      is_spawnable: false,
      is_summonable: true,
      properties: {
        "yasu_ride:lit": { type: "bool", default: false, client_sync: true },
      },
    });
    expect(entity.components).toEqual({
      "minecraft:type_family": {
        family: ["yasu_ride_gas_lantern", "inanimate"],
      },
      "minecraft:collision_box": { width: 0.5, height: 0.75 },
      "minecraft:physics": { has_collision: true, has_gravity: true },
      "minecraft:pushable": {
        is_pushable: false,
        is_pushable_by_piston: false,
      },
      "minecraft:knockback_resistance": { value: 1 },
      "minecraft:health": { value: 20, max: 20 },
      "minecraft:damage_sensor": {
        triggers: { cause: "all", deals_damage: "no" },
      },
      "minecraft:persistent": {},
      "minecraft:interact": {
        interactions: [
          { interact_text: "action.interact.yasu_ride.gas_lantern" },
        ],
      },
    });
  });

  it("crafts glass panes around a torch above iron into one stackable item", () => {
    const item = readJson(`${bp}/items/yasu_ride/gas_lantern_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description).toEqual({
      identifier: "yasu_ride:gas_lantern_item",
      menu_category: { category: "items" },
    });
    expect(item.components).toEqual({
      "minecraft:icon": "yasu_ride_gas_lantern_item",
      "minecraft:max_stack_size": 16,
      "minecraft:display_name": {
        value: "item.yasu_ride:gas_lantern_item.name",
      },
    });
    const recipe = readJson(
      `${bp}/recipes/yasu_ride/gas_lantern_item.recipe.json`,
    )["minecraft:recipe_shaped"];
    expect(recipe).toEqual({
      description: { identifier: "yasu_ride:gas_lantern_item" },
      tags: ["crafting_table"],
      pattern: [" G ", "GTG", " I "],
      key: {
        G: { item: "minecraft:glass_pane" },
        T: { item: "minecraft:torch" },
        I: { item: "minecraft:iron_ingot" },
      },
      result: { item: "yasu_ride:gas_lantern_item", count: 1 },
    });
  });

  it("uses the outdoor icon size and atlas entry and translates all four UI keys", () => {
    const icon = readRgbaPng(
      `${rp}/textures/items/yasu_ride/gas_lantern_item.png`,
    );
    const firePitIcon = readRgbaPng(
      `${rp}/textures/items/yasu_ride/fire_pit_item.png`,
    );
    expect([icon.width, icon.height]).toEqual([32, 32]);
    expect([icon.width, icon.height]).toEqual([
      firePitIcon.width,
      firePitIcon.height,
    ]);
    expect(
      readJson(`${rp}/textures/item_texture.json`).texture_data
        .yasu_ride_gas_lantern_item,
    ).toEqual({ textures: "textures/items/yasu_ride/gas_lantern_item" });
    for (const locale of ["en_US", "ja_JP"]) {
      const lang = readFileSync(`${rp}/texts/${locale}.lang`, "utf8");
      for (const key of [
        "item.yasu_ride:gas_lantern_item.name",
        "entity.yasu_ride:gas_lantern.name",
        "yasu_ride.hint.gas_lantern_hits",
        "action.interact.yasu_ride.gas_lantern",
      ]) {
        expect(
          lang.split("\n").filter((line) => line.startsWith(`${key}=`)),
        ).toHaveLength(1);
        expect(
          lang
            .split("\n")
            .find((line) => line.startsWith(`${key}=`))
            ?.split("=")[1]?.length,
        ).toBeGreaterThan(0);
      }
    }
    expect(readJson(`${rp}/manifest.json`).modules[0].version).toEqual([
      0, 1, 196,
    ]);
  });
});
