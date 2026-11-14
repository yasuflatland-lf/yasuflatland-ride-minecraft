import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KITCHEN_DRAWERS } from "../../src/domain/vehicle/kinds/camper/furniture";
import { DRAWER_GEAR_IDS } from "../../src/domain/vehicle/kinds/camper/spec";
import { defined } from "../support/defined";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const block = read(
  "packs/yasu_ride_bp/blocks/yasu_ride/drawers_decor_pair.block.json",
)["minecraft:block"];
const bones = read(
  "packs/yasu_ride_rp/models/blocks/yasu_ride/drawers_decor_pair.geo.json",
)["minecraft:geometry"][0].bones as {
  name: string;
  cubes: { origin: number[]; pivot?: number[] }[];
}[];
const entity = read("packs/yasu_ride_bp/entities/yasu_ride/camper.se.json")[
  "minecraft:entity"
].description;
const contents = read(
  "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
)["minecraft:geometry"][1];
const client = read("packs/yasu_ride_rp/entity/yasu_ride/camper.ce.json")[
  "minecraft:client_entity"
].description;
const controllers = read(
  "packs/yasu_ride_rp/render_controllers/yasu_ride/camper.rc.json",
).render_controllers;
const visible = (name: string, states: Record<string, number | boolean>) => {
  const expression = block.components["minecraft:geometry"].bone_visibility[
    name
  ] as string;
  return expression.split(" && ").every((term) => {
    const match = /^q\.block_state\('([^']+)'\) == (\d+|true)$/.exec(term);
    if (!match) throw new Error(`Unexpected visibility term: ${term}`);
    return (
      states[defined(match[1], "state")] ===
      (match[2] === "true" ? true : Number(match[2]))
    );
  });
};

describe("drawer compartment art", () => {
  it("keeps only counter decor in eighty block permutations", () => {
    const states = block.description.states as Record<string, unknown[]>;
    expect(
      Object.values(states).reduce((n, values) => n * values.length, 1),
    ).toBe(80);
    expect(states["yasu_ride:top_drawer"]).toBeUndefined();
    expect(states["yasu_ride:bottom_drawer"]).toBeUndefined();
    expect(states["yasu_ride:height"]).toBeUndefined();
    expect(states["yasu_ride:open"]).toBeUndefined();
    expect(block.permutations).toHaveLength(5);
    expect(block.components["minecraft:collision_box"]).toBe(false);
    expect(block.components["minecraft:custom_components"]).toEqual([
      "yasu_ride:camper_cabinet",
    ]);
  });

  it("uses independently selected entity item bones with the gear atlas", () => {
    const items = [...DRAWER_GEAR_IDS];
    const controller =
      controllers["controller.render.yasu_ride.camper.drawer_items"];
    expect(client.geometry.drawer_items).toBe(contents.description.identifier);
    expect(client.textures.drawer_items).toBe(
      "textures/blocks/yasu_ride/camping_gear",
    );
    expect(client.render_controllers[0]).toBe(
      "controller.render.yasu_ride.camper.drawer_items",
    );
    expect(controller.geometry).toBe("Geometry.drawer_items");
    expect(controller.textures).toEqual(["Texture.drawer_items"]);
    expect(controller.part_visibility[0]).toEqual({ "*": false });
    expect(contents.description.texture_width).toBe(512);
    expect(contents.description.texture_height).toBe(512);
    const mainBones = read(
      "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
    )["minecraft:geometry"][0].bones;
    for (const name of ["root", "body", "drawer_top", "drawer_bottom"]) {
      const main = mainBones.find(
        (bone: { name: string }) => bone.name === name,
      );
      const skeleton = contents.bones.find(
        (bone: { name: string }) => bone.name === name,
      );
      expect(skeleton.parent).toBe(main.parent);
      expect(skeleton.pivot).toEqual(main.pivot);
      expect(skeleton.rotation).toEqual(main.rotation);
      expect(skeleton.cubes).toBeUndefined();
    }
    for (const door of KITCHEN_DRAWERS.doors) {
      expect(entity.properties[`yasu_ride:${door.id}_item`]).toEqual({
        type: "int",
        range: [0, items.length],
        default: 0,
        client_sync: true,
      });
      const parent = contents.bones.find(
        (b: { name: string }) => b.name === door.id,
      );
      expect(parent.parent).toBe("body");
      for (const [index, item] of items.entries()) {
        expect(controller.part_visibility).toContainEqual({
          [`${door.id}_item_${item}`]: `q.property('yasu_ride:${door.id}_item') == ${index + 1}`,
        });
        const source = read(
          `packs/yasu_ride_rp/models/blocks/yasu_ride/${item}.geo.json`,
        )["minecraft:geometry"][0].bones[0].cubes;
        const group = contents.bones.find(
          (b: { name: string }) => b.name === `${door.id}_item_${item}`,
        );
        expect(group.parent).toBe(door.id);
        expect(group.cubes).toHaveLength(source.length);
        const floor = defined(door.slots[0], "slot").height + 16;
        for (const [i, cube] of group.cubes.entries()) {
          expect(cube.uv).toEqual(source[i].uv);
          expect(cube.size).toEqual(source[i].size);
          expect(cube.rotation).toEqual(source[i].rotation);
          for (const key of ["origin", "pivot"]) {
            if (!source[i][key]) {
              expect(cube[key]).toBeUndefined();
              continue;
            }
            for (const [axis, shift] of [-14, floor, 16.45].entries())
              expect(cube[key][axis] - source[i][key][axis]).toBeCloseTo(
                shift,
                2,
              );
          }
        }
      }
    }
    expect(
      bones.every((b) => b.name === "anchor" || b.name.startsWith("counter_")),
    ).toBe(true);
  });

  it("preserves transparency for drawer gear that needs alpha", () => {
    const controller =
      controllers["controller.render.yasu_ride.camper.drawer_items"];
    for (const item of DRAWER_GEAR_IDS) {
      const decor = read(
        `packs/yasu_ride_bp/blocks/yasu_ride/${item}_decor.block.json`,
      )["minecraft:block"];
      const materials = decor.components[
        "minecraft:material_instances"
      ] as Record<string, { render_method: string }>;
      if (
        !Object.values(materials).some(({ render_method }) =>
          ["alpha_test", "blend"].includes(render_method),
        )
      )
        continue;
      for (const door of KITCHEN_DRAWERS.doors) {
        const name = `${door.id}_item_${item}`;
        expect(
          contents.bones.some((bone: { name: string }) => bone.name === name),
        ).toBe(true);
        let material: string | undefined;
        for (const mapping of controller.materials as Record<
          string,
          string
        >[]) {
          for (const [pattern, value] of Object.entries(mapping)) {
            if (new RegExp(`^${pattern.split("*").join(".*")}$`).test(name))
              material = value;
          }
        }
        expect(material, name).toBeDefined();
        const value =
          client.materials[defined(material, name).replace("Material.", "")];
        expect(value, name).toBeDefined();
        expect(value, name).not.toBe("entity");
      }
    }
  });

  it("keeps counter gear at fourteen pixels independent of drawer state", () => {
    expect(
      visible("counter_potted_plant", {
        "yasu_ride:counter_page": 0,
        "yasu_ride:counter_item": 1,
      }),
    ).toBe(true);
    const counter = defined(
      bones.find((bone) => bone.name === "counter_potted_plant"),
      "counter bone",
    );
    expect(
      Math.min(...counter.cubes.map((cube) => defined(cube.origin[1], "y"))),
    ).toBe(14);
    expect(block.components["minecraft:geometry"].bone_visibility.anchor).toBe(
      false,
    );
  });
});
