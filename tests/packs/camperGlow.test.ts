import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { CAMPER_SPEC } from "../../src/domain/vehicle/kinds/camper/spec";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const read = (path: string) =>
  JSON.parse(readFileSync(`${RP}/${path}`, "utf8"));
interface GlowBone extends Bone {
  pivot: [number, number, number];
  locators?: Record<string, number[]>;
  cubes: NonNullable<Bone["cubes"]>;
}
const bones: GlowBone[] = read("models/entity/yasu_ride/camper.geo.json")[
  "minecraft:geometry"
][0].bones;
const bone = (name: string) => {
  const found = bones.find((b) => b.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
};
const glows = ["fl", "fr", "rl", "rr"].map((w) => bone(`glow_${w}`));
const controllers = read(
  "render_controllers/yasu_ride/camper.rc.json",
).render_controllers;
const render = controllers["controller.render.yasu_ride.camper"];

it("centers round discs at the hover locators below folded camper wheels", () => {
  for (const glow of glows) {
    const wheel = bone(glow.name.replace("glow_", "wheel_"));
    const radius = wheel.pivot[1];
    expect(glow.parent).toBe("body");
    expect(glow.pivot).toEqual(
      bone("body").locators?.[glow.name.replace("glow_", "hover_")],
    );
    expect(glow.cubes).toHaveLength(16);
    for (const cube of glow.cubes) {
      expect(cube.pivot).toEqual(glow.pivot);
      expect(cube.origin[1]).toBe(-0.5);
      expect(cube.size[1]).toBe(0.5);
      expect(cube.size[0]).toBe(cube.size[2]);
      expect(cube.rotation?.[0]).toBe(0);
      expect(cube.rotation?.[2]).toBe(0);
      for (const point of turnedCorners(glow, cube)) {
        expect(Math.hypot(point[0], point[2]) / 16).toBeLessThan(
          CAMPER_SPEC.footprint,
        );
        expect(
          Math.hypot(point[0] - glow.pivot[0], point[2] - glow.pivot[2]),
        ).toBeCloseTo(radius, 2);
      }
    }
  }
  // Boundary valleys distinguish the round union from a square with the same corner radius.
  fc.assert(
    fc.property(fc.double({ min: 0, max: 360, noNaN: true }), (degree) => {
      for (const glow of glows) {
        const radius = bone(glow.name.replace("glow_", "wheel_")).pivot[1];
        const reach = Math.max(
          ...glow.cubes.map((cube) => {
            const angle =
              ((degree - (cube.rotation?.[1] ?? 0)) * Math.PI) / 180;
            return Math.min(
              cube.size[0] / 2 / Math.abs(Math.cos(angle)),
              cube.size[2] / 2 / Math.abs(Math.sin(angle)),
            );
          }),
        );
        expect(reach).toBeGreaterThanOrEqual(radius * 0.95);
        expect(reach).toBeLessThanOrEqual(radius + 0.002);
      }
    }),
  );
});

it("gives only the glow bones a partial-alpha emissive material and hides them with the gear down", () => {
  expect(
    read("entity/yasu_ride/camper.ce.json")["minecraft:client_entity"]
      .description.materials.glow,
  ).toBe("entity_emissive_alpha");
  expect(
    render.materials.filter((entry: Record<string, string>) =>
      Object.values(entry).includes("Material.glow"),
    ),
  ).toEqual([{ "glow_*": "Material.glow" }]);
  expect(render.part_visibility).toContainEqual({
    "glow_*": "!query.property('yasu_ride:gear_down')",
  });
  expect(
    controllers["controller.render.yasu_ride.camper.lit"].part_visibility,
  ).toEqual([
    { "*": false },
    { headlights: "query.property('yasu_ride:headlights')" },
    { ceiling_lights: "query.property('yasu_ride:ceiling_lights')" },
  ]);
  for (const paint of PAINTS) {
    const name = paint === PAINTS[0] ? "camper" : `camper_${paint}`;
    const { pixels } = readRgbaPng(
      `${RP}/textures/entity/yasu_ride/${name}.png`,
    );
    for (const glow of glows) {
      const cubes = glow.cubes as (GlowBone["cubes"][number] & {
        uv: Record<string, { uv: number[] }>;
      })[];
      for (const cube of cubes) {
        for (const face of Object.values(cube.uv)) {
          const slot = face.uv[0] ?? -1;
          expect(Array.from(pixels.slice(slot * 4, slot * 4 + 4))).toEqual([
            80, 170, 255, 40,
          ]);
        }
      }
    }
  }
});
