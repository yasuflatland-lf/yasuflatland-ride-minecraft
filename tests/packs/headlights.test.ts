import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEADLIGHT_SWITCH_TYPE } from "../../src/infrastructure/shared/identifiers";
import { HEADLIGHTS_PROPERTY } from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { readRgbaPng } from "../support/png";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
describe.each(["suv", "sportsboat", "camper", "bulldozer"])(
  "%s headlights (ADR 0020)",
  (vehicle) => {
    const entity = read(
      `packs/yasu_ride_bp/entities/yasu_ride/${vehicle}.se.json`,
    )["minecraft:entity"];
    const client = read(
      `packs/yasu_ride_rp/entity/yasu_ride/${vehicle}.ce.json`,
    )["minecraft:client_entity"].description;
    const controller = read(
      `packs/yasu_ride_rp/render_controllers/yasu_ride/${vehicle}.rc.json`,
    ).render_controllers[`controller.render.yasu_ride.${vehicle}`];
    const bones: { name: string; parent?: string; cubes?: unknown[] }[] = read(
      `packs/yasu_ride_rp/models/entity/yasu_ride/${vehicle}.geo.json`,
    )["minecraft:geometry"][0].bones;

    it("the vehicle starts with its headlights off, and the client sees the property", () => {
      expect(entity.description.properties[HEADLIGHTS_PROPERTY]).toEqual({
        type: "bool",
        default: false,
        client_sync: true,
      });
    });

    it("the lamps are a bone of the body that has cubes", () => {
      const lamps = bones.find((b) => b.name === "headlights");
      expect(lamps?.parent).toBe("body");
      expect(lamps?.cubes?.length).toBeGreaterThan(0);
    });

    it("the base render controller keeps the unlit lamp material", () => {
      expect(controller.materials).toContainEqual({
        headlights: "Material.lamp",
      });
      expect(controller.arrays.materials).toBeUndefined();
      expect(client.materials.lamp).toBe("entity");
      expect(client.materials.lamp_lit).toBe("entity_emissive");
    });
  },
);

describe("SUV tail lights", () => {
  const bones: {
    name: string;
    parent?: string;
    cubes?: {
      origin: [number, number, number];
      size: [number, number, number];
      uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
    }[];
  }[] = read("packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json")[
    "minecraft:geometry"
  ][0].bones;
  const controller = read(
    "packs/yasu_ride_rp/render_controllers/yasu_ride/suv.rc.json",
  ).render_controllers["controller.render.yasu_ride.suv"];

  it("places both detailed tail faces and the third brake light on the tail bone", () => {
    const tail = bones.find((bone) => bone.name === "tail_lights");
    expect(tail?.parent).toBe("body");
    expect(tail?.cubes).toHaveLength(3);
    const faceSizes = [];
    for (const cube of tail?.cubes ?? []) {
      const face = cube.uv.south;
      if (!face) throw new Error("Tail lamp has no rear face");
      const { uv, uv_size: size } = face;
      const [u0, u1] = [uv[0], uv[0] + size[0]].sort((a, b) => a - b);
      const [v0, v1] = [uv[1], uv[1] + size[1]].sort((a, b) => a - b);
      expect(u0).toBeGreaterThanOrEqual(96);
      expect(u1).toBeLessThanOrEqual(192);
      expect(v0).toBeGreaterThanOrEqual(168);
      expect(v1).toBeLessThanOrEqual(256);
      faceSizes.push([Math.abs(size[0]), size[1]]);
    }
    expect(faceSizes).toEqual([
      [12, 3],
      [12, 24],
      [12, 24],
    ]);
  });

  it("keeps the outer resin blocks and bumper reflectors on the body", () => {
    const resin = [];
    const reflectors = [];
    for (const bone of bones) {
      for (const cube of bone.cubes ?? []) {
        if (
          Object.values(cube.uv).every(({ uv }) => uv[0] === 85 && uv[1] === 1)
        ) {
          resin.push(cube);
          expect(bone.name).toBe("body");
        }
        if (
          Object.values(cube.uv).every(({ uv }) => uv[0] === 33 && uv[1] === 1)
        ) {
          if (cube.size[2] < 1) reflectors.push(cube);
          expect(bone.name).toBe("body");
        }
      }
    }
    expect(resin).toHaveLength(2);
    expect(reflectors).toHaveLength(2);
    const tailCubes =
      bones.find((bone) => bone.name === "tail_lights")?.cubes ?? [];
    for (const cube of resin) {
      const side = Math.sign(cube.origin[0]);
      const lamp = tailCubes.find(
        (entry) =>
          entry.uv.south?.uv_size[1] === 24 &&
          Math.sign(entry.origin[0]) === side,
      );
      expect(lamp).toBeDefined();
      expect(cube.origin.slice(1)).toEqual(lamp?.origin.slice(1));
      expect(cube.size.slice(1)).toEqual(lamp?.size.slice(1));
      expect(
        side > 0 ? cube.origin[0] : cube.origin[0] + cube.size[0],
      ).toBeCloseTo(
        side > 0
          ? (lamp?.origin[0] ?? 0) + (lamp?.size[0] ?? 0)
          : (lamp?.origin[0] ?? 0),
      );
    }
  });

  it("uses the unlit material and hides the base pass when switched on", () => {
    expect(controller.materials).toContainEqual({
      tail_lights: "Material.lamp",
    });
    expect(controller.part_visibility).toContainEqual({
      tail_lights: "!query.property('yasu_ride:headlights')",
    });
  });

  it("places every light swatch cube on the headlights bone", () => {
    let lightCubes = 0;
    for (const bone of bones) {
      for (const cube of bone.cubes ?? []) {
        const light = Object.values(cube.uv).some(
          ({ uv }) => uv[0] >= 28 && uv[0] < 32 && uv[1] >= 0 && uv[1] < 4,
        );
        if (light) {
          lightCubes++;
          expect(bone.name).toBe("headlights");
        }
      }
    }
    expect(lightCubes).toBeGreaterThan(0);
  });
});

describe("headlight switch (ADR 0020)", () => {
  it("has a switch item with an icon, a name, and a recipe unlocked from the start", () => {
    const item = read(
      "packs/yasu_ride_bp/items/yasu_ride/headlight_switch.item.json",
    )["minecraft:item"];
    expect(item.description.identifier).toBe(HEADLIGHT_SWITCH_TYPE);
    const icon = item.components["minecraft:icon"];
    const texture = read("packs/yasu_ride_rp/textures/item_texture.json")
      .texture_data[icon]?.textures;
    expect(existsSync(`packs/yasu_ride_rp/${texture}.png`)).toBe(true);
    for (const lang of ["en_US", "ja_JP"]) {
      expect(
        readFileSync(`packs/yasu_ride_rp/texts/${lang}.lang`, "utf8"),
      ).toContain(`item.${HEADLIGHT_SWITCH_TYPE}.name=`);
    }
    const recipe = read(
      "packs/yasu_ride_bp/recipes/yasu_ride/headlight_switch.recipe.json",
    )["minecraft:recipe_shapeless"];
    expect(recipe.result.item).toBe(HEADLIGHT_SWITCH_TYPE);
    expect(recipe.unlock).toEqual({ context: "AlwaysUnlocked" });
  });
});

describe("SUV round headlights (ADR 0192)", () => {
  function hasBezelVisibility(partVisibility: Record<string, unknown>[]) {
    return partVisibility.some((entry) => "headlight_bezels" in entry);
  }

  const rp = "packs/yasu_ride_rp";
  const bones: {
    name: string;
    parent?: string;
    pivot: [number, number, number];
    cubes?: {
      origin: [number, number, number];
      size: [number, number, number];
      uv: Record<
        "north" | "south",
        { uv: [number, number]; uv_size: [number, number] }
      >;
    }[];
  }[] = read(`${rp}/models/entity/yasu_ride/suv.geo.json`)[
    "minecraft:geometry"
  ][0].bones;
  const controllers = read(
    `${rp}/render_controllers/yasu_ride/suv.rc.json`,
  ).render_controllers;
  const base = controllers["controller.render.yasu_ride.suv"];
  const overlay = controllers["controller.render.yasu_ride.suv.lit"];
  const lens =
    bones
      .find(({ name }) => name === "headlights")
      ?.cubes?.filter(({ uv }) => Math.abs(uv.north.uv_size[0]) >= 32) ?? [];
  const bezels = bones.find(({ name }) => name === "headlight_bezels");

  it("keeps two cutout bezels on an origin-pivoted body child in the base pass", () => {
    expect(bezels?.parent).toBe("body");
    expect(bezels?.pivot).toEqual([0, 0, 0]);
    expect(bezels?.cubes).toHaveLength(2);
    const client = read(`${rp}/entity/yasu_ride/suv.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.materials.lamp_cutout).toBe("entity_alphatest");
    expect(base.materials).toContainEqual({
      headlight_bezels: "Material.lamp_cutout",
    });
    expect(base.part_visibility).toContainEqual({ "*": true });
    expect(hasBezelVisibility(base.part_visibility)).toBe(false);
    expect(overlay.part_visibility).toContainEqual({ "*": false });
    expect(hasBezelVisibility(overlay.part_visibility)).toBe(false);
  });

  it("uses high-resolution square lens faces and slightly forward, larger bezel panels", () => {
    expect(lens).toHaveLength(2);
    for (const cube of lens) {
      expect(Math.abs(cube.uv.north.uv_size[0])).toBeGreaterThanOrEqual(32);
      expect(Math.abs(cube.uv.north.uv_size[1])).toBeGreaterThanOrEqual(32);
      expect(cube.size[0]).toBeCloseTo(cube.size[1]);
      expect(cube.size[2] / cube.size[0]).toBeCloseTo(0.1 / 5.6, 4);
      const bezel = bezels?.cubes?.find(
        (panel) =>
          Math.abs(
            panel.origin[0] +
              panel.size[0] / 2 -
              cube.origin[0] -
              cube.size[0] / 2,
          ) < 0.001,
      );
      expect(bezel).toBeDefined();
      expect(bezel?.size[0]).toBeCloseTo(cube.size[0] * 1.25, 4);
      expect(
        (cube.origin[2] - (bezel?.origin[2] ?? 0)) / cube.size[0],
      ).toBeCloseTo(0.05 / 5.6, 4);
    }
  });

  it("cuts exactly the lens circle out of every paint's bezel and keeps flat body MER", () => {
    const paints: { name: string; body: number[] }[] = JSON.parse(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
print(json.dumps([{'name': p.name, 'body': p.body} for p in load_tool('suv_palette').BODY_PAINTS]))`,
        ],
        { encoding: "utf8" },
      ),
    );
    const face = bezels?.cubes?.[0]?.uv.north;
    expect(face).toBeDefined();
    if (!face) throw new Error("Missing bezel face");
    expect(bezels?.cubes).toHaveLength(2);
    for (const cube of bezels?.cubes ?? []) {
      expect(cube.uv.north).toEqual(face);
      expect(cube.uv.south).toEqual(face);
    }
    const w = Math.abs(face.uv_size[0]);
    const h = Math.abs(face.uv_size[1]);
    const x0 = Math.min(face.uv[0], face.uv[0] + face.uv_size[0]);
    const y0 = Math.min(face.uv[1], face.uv[1] + face.uv_size[1]);
    for (const paint of paints) {
      const name = paint.name === "khaki" ? "suv" : `suv_${paint.name}`;
      const image = readRgbaPng(`${rp}/textures/entity/yasu_ride/${name}.png`);
      const mer = readRgbaPng(
        `${rp}/textures/entity/yasu_ride/${name}_mer.png`,
      );
      const bodyMer = [
        ...mer.pixels.subarray((mer.width + 1) * 4, (mer.width + 1) * 4 + 4),
      ];
      const screwTexels = new Set<number>();
      for (let v = 0; v < h; v++) {
        for (let u = 0; u < w; u++) {
          const inside =
            (u + 0.5 - w / 2) ** 2 + (v + 0.5 - h / 2) ** 2 <=
            (w / 1.25 / 2) ** 2;
          const i = ((y0 + v) * image.width + x0 + u) * 4;
          expect(image.pixels[i + 3]).toBe(inside ? 0 : 255);
          expect([paint.body, [14, 14, 14]]).toContainEqual([
            ...image.pixels.subarray(i, i + 3),
          ]);
          expect([...mer.pixels.subarray(i, i + 4)]).toEqual(bodyMer);
          if (
            image.pixels[i] === 14 &&
            image.pixels[i + 1] === 14 &&
            image.pixels[i + 2] === 14 &&
            image.pixels[i + 3] === 255
          ) {
            screwTexels.add(v * w + u);
          }
        }
      }
      let screwCount = 0;
      for (const start of screwTexels) {
        const component = [start];
        screwTexels.delete(start);
        let sumU = 0;
        let sumV = 0;
        for (const texel of component) {
          const u = texel % w;
          const v = Math.floor(texel / w);
          sumU += u + 0.5 - w / 2;
          sumV += v + 0.5 - h / 2;
          for (const [x, y] of [
            [u - 1, v],
            [u + 1, v],
            [u, v - 1],
            [u, v + 1],
          ] as const) {
            if (x < 0 || x >= w || y < 0 || y >= h) continue;
            const neighbor = y * w + x;
            if (screwTexels.delete(neighbor)) component.push(neighbor);
          }
        }
        const radius = Math.hypot(
          sumU / component.length,
          sumV / component.length,
        );
        expect(Math.abs(radius - (1.1 * w) / 1.25 / 2)).toBeLessThanOrEqual(1);
        screwCount++;
      }
      expect(screwCount).toBe(6);
    }
  });
});
