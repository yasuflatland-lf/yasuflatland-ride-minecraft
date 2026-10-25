import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const RP = "packs/yasu_ride_rp";
const read = (path: string) =>
  JSON.parse(readFileSync(`${RP}/${path}`, "utf8"));

// The generators write RGBA8 PNGs with unfiltered scanlines.
function png(name: string) {
  const data = readFileSync(`${RP}/textures/entity/yasu_ride/${name}.png`);
  expect(data.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect([data[24], data[25]]).toEqual([8, 6]);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const chunks: Buffer[] = [];
  for (let pos = 8; pos < data.length; ) {
    const length = data.readUInt32BE(pos);
    if (data.toString("ascii", pos + 4, pos + 8) === "IDAT")
      chunks.push(data.subarray(pos + 8, pos + 8 + length));
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const pixels: number[][] = [];
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width * 4 + 1)]).toBe(0);
    for (let x = 0; x < width; x++) {
      const start = y * (width * 4 + 1) + 1 + x * 4;
      pixels.push([...raw.subarray(start, start + 4)]);
    }
  }
  return { width, height, pixels };
}

const headlights = "query.property('yasu_ride:headlights')";
const ceiling = "query.property('yasu_ride:ceiling_lights')";
const kinds = [
  { kind: "suv", slots: [7], cell: 4, bones: { headlights } },
  { kind: "sportsboat", slots: [14], cell: 4, bones: { headlights } },
  {
    kind: "camper",
    slots: [14, 33],
    cell: 1,
    bones: { headlights, ceiling_lights: ceiling },
  },
  {
    kind: "bulldozer",
    slots: [14, 16],
    cell: 1,
    bones: { headlights, beacon: headlights },
  },
];

describe.each(kinds)(
  "$kind lit textures (ADR 0147)",
  ({ kind, slots, cell, bones }) => {
    it("generates a matching color atlas, maximum-emissive MER mask, and exact texture set", () => {
      const base = png(kind);
      const lit = png(`${kind}_lit`);
      const mer = png(`${kind}_lit_mer`);
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
      const condition =
        kind === "camper" ? `${headlights} || ${ceiling}` : headlights;
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
  expect(rp.header.version).toEqual([0, 1, 128]);
  expect(rp.modules[0].version).toEqual(rp.header.version);
  expect(
    bp.dependencies.find(
      (dependency: { uuid?: string }) => dependency.uuid === rp.header.uuid,
    )?.version,
  ).toEqual(rp.header.version);
});
