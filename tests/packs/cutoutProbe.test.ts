import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const RP = "packs/yasu_ride_test_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
interface Face {
  uv: [number, number];
  uv_size: [number, number];
}
interface Bone {
  name: string;
  cubes?: { origin: number[]; size: number[]; uv: Record<string, Face> }[];
}
const geometry = read(
  `${RP}/models/entity/yasu_ride_test/cutout_probe.geo.json`,
)["minecraft:geometry"][0];
const bones: Bone[] = geometry.bones;
const client = read(`${RP}/entity/yasu_ride_test/cutout_probe.ce.json`)[
  "minecraft:client_entity"
].description;
const controllers = read(
  `${RP}/render_controllers/yasu_ride_test/cutout_probe.rc.json`,
).render_controllers;
const png = readFileSync(`${RP}/${client.textures.default}.png`);

function decodeRgba() {
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.toString("ascii", 12, 16)).toBe("IHDR");
  expect([...png.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect([width, height]).toEqual([256, 160]);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4 + 1;
  expect(raw.length).toBe(height * stride);
  for (let y = 0; y < height; y++) {
    // The dedicated generator uses filter zero so bytes retain their RGBA order.
    expect(raw[y * stride]).toBe(0);
  }
  return (x: number, y: number) => {
    const offset = y * stride + 1 + x * 4;
    return [...raw.subarray(offset, offset + 4)];
  };
}

describe("dev-only cutout probe", () => {
  it("resolves its client assets and assigns alpha blend only to the last water bone", () => {
    expect(client.identifier).toBe("yasu_ride_test:cutout_probe");
    expect(client.geometry.default).toBe(geometry.description.identifier);
    expect([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]).toEqual([256, 160]);
    expect(bones.map((bone) => bone.name)).toEqual([
      "root",
      "plate",
      "disc",
      "pool_floor",
      "water",
    ]);
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride_test.cutout_probe",
    ]);
    const controller = controllers[client.render_controllers[0]];
    expect(controller.geometry).toBe("Geometry.default");
    expect(controller.textures).toEqual(["Texture.default"]);
    expect(controller.materials).toEqual([
      { "*": "Material.default" },
      { water: "Material.water" },
    ]);
    expect(client.materials).toEqual({
      default: "entity_alphatest",
      water: "entity_alphablend",
    });
    const floor = bones.find((bone) => bone.name === "pool_floor")?.cubes?.[0];
    const water = bones.at(-1)?.cubes?.[0];
    expect(floor).toBeDefined();
    expect(water).toBeDefined();
    expect(water?.origin[1]).toBeGreaterThan(
      (floor?.origin[1] ?? 0) + (floor?.size[1] ?? 0),
    );
  });

  it("maps every hidden face into the padded transparent region", () => {
    const pixel = decodeRgba();
    for (const name of ["plate", "disc", "water"]) {
      const cubes = bones.find((bone) => bone.name === name)?.cubes ?? [];
      expect(cubes).toHaveLength(1);
      for (const cube of cubes) {
        for (const face of ["north", "south", "east", "west", "down"]) {
          const uv = cube.uv[face];
          expect(uv).toEqual({ uv: [144, 136], uv_size: [8, 8] });
          // Include a one-texel border to catch filtering into a visible region.
          for (let y = 135; y <= 144; y++) {
            for (let x = 143; x <= 152; x++) {
              expect(pixel(x, y)).toEqual([216, 176, 124, 0]);
            }
          }
        }
      }
    }
  });

  it("uses hard cutouts with region RGB preserved through every transparent texel", () => {
    const pixel = decodeRgba();
    for (const [name, left, color] of [
      ["plate", 0, [216, 176, 124]],
      ["disc", 128, [154, 166, 174]],
    ] as const) {
      const top = bones.find((bone) => bone.name === name)?.cubes?.[0]?.uv.up;
      expect(top).toEqual({ uv: [left, 0], uv_size: [128, 128] });
      const alphas = new Set<number>();
      const opaqueRgb = new Set<string>();
      const transparentRgb = new Set<string>();
      for (let y = 0; y < 128; y++) {
        for (let x = left; x < left + 128; x++) {
          const rgba = pixel(x, y);
          const alpha = rgba[3] as number;
          alphas.add(alpha);
          (alpha === 0 ? transparentRgb : opaqueRgb).add(
            rgba.slice(0, 3).join(","),
          );
        }
      }
      expect(alphas).toEqual(new Set([0, 255]));
      // Uniform RGB means every transparent pixel matches its nearest opaque pixel,
      // including the hole boundary, without black or white under the cutout.
      expect(opaqueRgb).toEqual(new Set([color.join(",")]));
      expect(transparentRgb).toEqual(opaqueRgb);
      expect(pixel(left, 0)[3]).toBe(0);
      expect(pixel(left + 64, 8)[3]).toBe(255);
      expect(pixel(left + 64, 64)[3]).toBe(name === "plate" ? 0 : 255);
    }
  });

  it("puts translucent blue-green water over an opaque floor", () => {
    const pixel = decodeRgba();
    for (const [name, expected] of [
      ["water", [74, 170, 180, 140]],
      ["pool_floor", [190, 158, 118, 255]],
    ] as const) {
      const cube = bones.find((bone) => bone.name === name)?.cubes?.[0];
      expect(cube).toBeDefined();
      for (const [face, mapping] of Object.entries(cube?.uv ?? {})) {
        if (name === "water" && face !== "up") continue;
        const [u, v] = mapping.uv;
        const [w, h] = mapping.uv_size;
        for (let y = v; y < v + h; y++) {
          for (let x = u; x < u + w; x++)
            expect(pixel(x, y)).toEqual([...expected]);
        }
      }
    }
  });

  it("keeps the probe persistent, stationary and summon-only in the test Behavior Pack", () => {
    const entity = read(
      "packs/yasu_ride_test_bp/entities/yasu_ride_test/cutout_probe.se.json",
    )["minecraft:entity"];
    expect(entity.description).toEqual({
      identifier: client.identifier,
      is_spawnable: false,
      is_summonable: true,
    });
    expect(entity.components["minecraft:persistent"]).toEqual({});
    expect(entity.components["minecraft:physics"]).toEqual({
      has_gravity: false,
      has_collision: false,
    });
    expect(
      Object.keys(entity.components).some(
        (key) =>
          key.startsWith("minecraft:behavior.") || key === "minecraft:despawn",
      ),
    ).toBe(false);
  });
});
