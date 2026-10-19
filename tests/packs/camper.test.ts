import { readdirSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/vehicle/paint";

const RP = "packs/yasu_ride_rp";
const geometryText = readFileSync(
  `${RP}/models/entity/yasu_ride/camper.geo.json`,
  "utf8",
);
interface Cube {
  origin: number[];
  size: number[];
  pivot?: number[];
  rotation?: number[];
  uv: Record<string, { uv: number[] }>;
}
interface Bone {
  name: string;
  parent?: string;
  pivot: number[];
  cubes?: Cube[];
  locators?: Record<string, number[]>;
}
const geometry = JSON.parse(geometryText)["minecraft:geometry"][0];
const bones: Bone[] = geometry.bones;
const bone = (name: string) => {
  const found = bones.find((b) => b.name === name);
  expect(found, name).toBeDefined();
  return found as Bone;
};

// The generator writes unfiltered 8-bit RGBA rows, as the preview generator does for icons.
function readPng(path: string) {
  const png = readFileSync(`${RP}/${path}.png`);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const length = png.readUInt32BE(pos);
    if (png.toString("ascii", pos + 4, pos + 8) === "IDAT") {
      idat.push(png.subarray(pos + 8, pos + 8 + length));
    }
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  expect(raw.length).toBe(height * (stride + 1));
  const pixels = Buffer.concat(
    Array.from({ length: height }, (_, y) => {
      const start = y * (stride + 1);
      expect(raw[start]).toBe(0);
      return raw.subarray(start + 1, start + 1 + stride);
    }),
  );
  return { width, height, pixels };
}

describe("camper model assets (ADR 0067)", () => {
  it("uses the production geometry identifier with no test namespace", () => {
    expect(geometry.description.identifier).toBe("geometry.yasu_ride.camper");
    expect(geometryText).not.toContain("yasu_ride_test");
  });

  it("connects every standard bone to root without cycles", () => {
    expect(bones.map((b) => b.name).sort()).toEqual(
      [
        "root",
        "body",
        "headlights",
        "wheel_fl",
        "wheel_fr",
        "wheel_rl",
        "wheel_rr",
        "seat_0",
        "seat_1",
        "seat_2",
        "seat_3",
        "door_entry",
        "steering",
      ].sort(),
    );
    expect(bone("root").parent).toBeUndefined();
    expect(bone("body").parent).toBe("root");
    for (const b of bones.filter((b) => b.name !== "root")) {
      const visited = new Set<string>();
      let current = b;
      while (current.name !== "root") {
        expect(visited.has(current.name), b.name).toBe(false);
        visited.add(current.name);
        current = bone(current.parent ?? "");
      }
      if (b.name !== "body") expect(b.parent).toBe("body");
    }
  });

  it("puts wheel pivots at the axle centers and hover locators directly below after mirroring", () => {
    const locators = bone("body").locators;
    expect(Object.keys(locators ?? {}).sort()).toEqual(
      ["hover_fl", "hover_fr", "hover_rl", "hover_rr", "exhaust"].sort(),
    );
    expect(locators?.exhaust).toEqual([12, 4, 52]);
    for (const [name, x, z] of [
      ["fl", 21.4, -31.5],
      ["fr", -21.4, -31.5],
      ["rl", 21.4, 31],
      ["rr", -21.4, 31],
    ] as const) {
      const wheel = bone(`wheel_${name}`);
      expect(wheel.pivot).toEqual([x, 6.5, z]);
      expect(locators?.[`hover_${name}`]).toEqual([x, 0, z]);
      expect(wheel.cubes).toHaveLength(64);
      expect(new Set(wheel.cubes?.map((c) => c.uv.north?.uv[0])).size).toBe(4);
      for (const cube of wheel.cubes ?? []) {
        expect(cube.pivot?.[1]).toBe(6.5);
        expect(cube.rotation).toBeDefined();
      }
    }
    expect(bone("door_entry").pivot).toEqual([-24, 0, -7]);
  });

  it("keeps the facing dinette on the driver's side, clear of the bed and side walls", () => {
    for (const name of ["seat_0", "seat_1", "headlights"]) {
      expect(bone(name).cubes?.length).toBeGreaterThan(0);
    }
    expect(bone("seat_0").cubes?.every((c) => (c.origin[0] ?? 0) > 0)).toBe(
      true,
    );
    expect(bone("seat_1").cubes?.every((c) => (c.origin[0] ?? 0) < 0)).toBe(
      true,
    );
    for (const name of ["seat_2", "seat_3"]) {
      const cubes = bone(name).cubes ?? [];
      expect(cubes).toHaveLength(2);
      for (const c of cubes) {
        expect(c.origin[0]).toBe(8);
        expect(c.size[0]).toBe(15);
        expect(c.origin[1]).toBeGreaterThanOrEqual(16);
        expect((c.origin[2] ?? 0) + (c.size[2] ?? 0)).toBeLessThanOrEqual(24);
      }
    }
  });

  it("generates all 16 equally sized paints, changing only the three accent swatches", () => {
    const files = readdirSync(`${RP}/textures/entity/yasu_ride`).filter(
      (name) => /^camper(?:_\w+)?\.png$/.test(name),
    );
    expect(files).toHaveLength(PAINTS.length);
    const khaki = readPng("textures/entity/yasu_ride/camper");
    expect([khaki.width, khaki.height]).toEqual([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]);
    for (const paint of PAINTS.slice(1)) {
      const texture = readPng(`textures/entity/yasu_ride/camper_${paint}`);
      expect([texture.width, texture.height]).toEqual([
        khaki.width,
        khaki.height,
      ]);
      expect(texture.pixels.equals(khaki.pixels), paint).toBe(false);
      for (let i = 0; i < khaki.width; i++) {
        // The PALETTE order in tools/gen_camper.py puts tan, khaki, and stripe
        // in slots 3, 4, and 6.
        if ([3, 4, 6].includes(i)) continue;
        expect(texture.pixels.subarray(i * 4, i * 4 + 4), paint).toEqual(
          khaki.pixels.subarray(i * 4, i * 4 + 4),
        );
      }
    }
  });

  it("generates a 16 by 16 RGBA item icon with transparency", () => {
    const icon = readPng("textures/items/yasu_ride/camper_item");
    expect([icon.width, icon.height]).toEqual([16, 16]);
    expect(icon.pixels.subarray(0, 16 * 4)).toEqual(Buffer.alloc(16 * 4));
    expect(icon.pixels.subarray((3 * 16 + 2) * 4, (3 * 16 + 3) * 4)).toEqual(
      Buffer.from([238, 235, 226, 255]),
    );
  });
});
