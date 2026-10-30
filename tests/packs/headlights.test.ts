import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HEADLIGHT_SWITCH_TYPE } from "../../src/infrastructure/shared/identifiers";
import { HEADLIGHTS_PROPERTY } from "../../src/infrastructure/vehicle/bedrock/identifiers";

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
    for (const cube of resin) {
      const side = Math.sign(cube.origin[0]);
      const lamp = bones
        .find((bone) => bone.name === "tail_lights")
        ?.cubes?.find(
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
