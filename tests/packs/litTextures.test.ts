import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const read = (path: string) =>
  JSON.parse(readFileSync(`${RP}/${path}`, "utf8"));

function texels(name: string) {
  const { width, height, pixels } = readRgbaPng(
    `${RP}/textures/entity/yasu_ride/${name}.png`,
  );
  return {
    width,
    height,
    pixels: Array.from({ length: width * height }, (_, i) => [
      ...pixels.subarray(i * 4, i * 4 + 4),
    ]),
  };
}

const headlights = "query.property('yasu_ride:headlights')";
const ceiling = "query.property('yasu_ride:ceiling_lights')";
// The slots are the palette columns the generators select by name into
// LIT_SLOTS (tools/gen_*.py). A palette reorder moves them, so update these
// together with the generators.
const kinds = [
  {
    kind: "suv",
    slots: [7],
    cell: 4,
    bones: { headlights },
    condition: headlights,
  },
  {
    kind: "sportsboat",
    slots: [14],
    cell: 4,
    bones: { headlights },
    condition: headlights,
  },
  {
    kind: "camper",
    slots: [14, 33],
    cell: 1,
    bones: { headlights, ceiling_lights: ceiling },
    condition: `${headlights} || ${ceiling}`,
  },
  {
    kind: "bulldozer",
    slots: [14, 16],
    cell: 1,
    bones: { headlights, beacon: headlights },
    condition: headlights,
  },
];

describe.each(kinds)(
  "$kind lit textures (ADR 0147)",
  ({ kind, slots, cell, bones, condition }) => {
    it("generates a matching color atlas, maximum-emissive MER mask, and exact texture set", () => {
      const base = texels(kind);
      const lit = texels(`${kind}_lit`);
      const mer = texels(`${kind}_lit_mer`);
      for (const image of [lit, mer])
        expect([image.width, image.height]).toEqual([base.width, base.height]);
      expect(
        read(`textures/entity/yasu_ride/${kind}_lit.texture_set.json`),
      ).toEqual({
        format_version: "1.16.100",
        "minecraft:texture_set": {
          color: `${kind}_lit`,
          metalness_emissive_roughness: `${kind}_lit_mer`,
        },
      });
      for (const [i, pixel] of base.pixels.entries()) {
        const on =
          Math.floor(i / base.width) < cell &&
          slots.includes(Math.floor((i % base.width) / cell));
        expect(lit.pixels[i], `color texel ${i}`).toEqual(
          on ? [...pixel.slice(0, 3), 0] : pixel,
        );
        expect(mer.pixels[i], `MER texel ${i}`).toEqual([
          0,
          on ? 255 : 0,
          255,
          255,
        ]);
      }
    });

    it("draws only the switched lamp bones in a separate emissive pass", () => {
      const client = read(`entity/yasu_ride/${kind}.ce.json`)[
        "minecraft:client_entity"
      ].description;
      const id = `controller.render.yasu_ride.${kind}`;
      const controllers = read(
        `render_controllers/yasu_ride/${kind}.rc.json`,
      ).render_controllers;
      expect(client.textures.lit).toBe(`textures/entity/yasu_ride/${kind}_lit`);
      expect(client.materials.lamp).toBe("entity");
      expect(client.materials.lamp_lit).toBe("entity_emissive");
      expect(client.render_controllers.indexOf(id)).toBeGreaterThanOrEqual(0);
      expect(client.render_controllers.indexOf(id)).toBeLessThan(
        client.render_controllers.length - 1,
      );
      expect(client.render_controllers.at(-1)).toEqual({
        [`${id}.lit`]: condition,
      });
      expect(controllers[`${id}.lit`]).toEqual({
        geometry: "Geometry.default",
        materials: [{ "*": "Material.lamp_lit" }],
        textures: ["Texture.lit"],
        part_visibility: [
          { "*": false },
          ...Object.entries(bones).map(([bone, property]) => ({
            [bone]: property,
          })),
        ],
      });
      const geometry = read(`models/entity/yasu_ride/${kind}.geo.json`)[
        "minecraft:geometry"
      ][0];
      for (const [bone, property] of Object.entries(bones)) {
        expect(
          geometry.bones.some((entry: { name: string }) => entry.name === bone),
        ).toBe(true);
        expect(controllers[id].materials).toContainEqual({
          [bone]: "Material.lamp",
        });
        expect(
          controllers[id].part_visibility.filter(
            (entry: Record<string, unknown>) => bone in entry,
          ),
        ).toEqual([{ [bone]: `!${property}` }]);
      }
      expect(controllers[id].arrays.materials).toBeUndefined();
    });
  },
);

it("requires the approved PBR engine version and matching Resource Pack versions", () => {
  const rp = read("manifest.json");
  const bp = JSON.parse(
    readFileSync("packs/yasu_ride_bp/manifest.json", "utf8"),
  );
  expect(rp.capabilities).toEqual(["pbr"]);
  expect(rp.header.min_engine_version).toEqual([1, 21, 120]);
  expect(rp.modules[0].version).toEqual(rp.header.version);
  expect(
    bp.dependencies.find(
      (dependency: { uuid?: string }) => dependency.uuid === rp.header.uuid,
    )?.version,
  ).toEqual(rp.header.version);
});
