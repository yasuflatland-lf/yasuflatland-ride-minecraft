import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Bone, turnedCorners } from "../support/geometry";

type Cube = NonNullable<Bone["cubes"]>[number] & {
  uv: Record<string, { uv: number[] }>;
};
const geometry = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
    "utf8",
  ),
)["minecraft:geometry"][0];
const cubes: Cube[] = geometry.bones.flatMap(
  (bone: { cubes?: Cube[] }) => bone.cubes ?? [],
);
const swatch = (cube: Cube, slot: number) =>
  cube.uv.north?.uv[0] === slot && cube.uv.north?.uv[1] === 0;
const minZ = (layer: Cube[], x: number) => {
  const points = layer.flatMap((cube) => turnedCorners({ name: "body" }, cube));
  const near = points.filter((point) => Math.abs(point[0] - x) < 0.002);
  expect(near.length).toBeGreaterThan(0);
  return Math.min(...near.map((point) => point[2]));
};
const placement = (cube: Cube) => ({
  origin: cube.origin,
  size: cube.size,
  rotation: cube.rotation,
});

describe("camper cab-over ridge", () => {
  it("places the center 4 px ahead of both outer edges in every lower layer", () => {
    for (let i = 0; i < 26; i++) {
      const y = 49.5 + i * 0.25;
      const layer = cubes.filter(
        (cube) =>
          swatch(cube, 0) &&
          cube.origin[1] === y &&
          cube.size[1] === 0.25 &&
          cube.origin[2] < -50,
      );
      const center = minZ(layer, 0);
      expect(center).toBeCloseTo(-57.7 - (1.3 * (i + 0.5)) / 26, 2);
      for (const x of [-21, 21])
        expect(minZ(layer, x) - center).toBeCloseTo(4, 2);
      expect(layer.filter((cube) => cube.rotation)).toHaveLength(2);
    }
  });

  it("tapers the upper ridge toward the straight roof edge", () => {
    for (let i = 0; i < 32; i++) {
      const u = (i + 0.5) / 32;
      const layer = cubes.filter(
        (cube) =>
          swatch(cube, 0) &&
          cube.origin[1] === 56 + i * 0.25 &&
          cube.size[1] === 0.25 &&
          cube.origin[2] < -50,
      );
      expect(minZ(layer, 0)).toBeCloseTo(-59 + 6 * u, 2);
      for (const x of [-24, 24])
        expect(minZ(layer, x) - minZ(layer, 0)).toBeCloseTo(
          (4 * (1 - u) * 24) / 21,
          2,
        );
    }
  });

  it("folds the chrome windshield header along the lower ridge", () => {
    const header = cubes.filter(
      (cube) =>
        swatch(cube, 10) &&
        cube.origin[1] === 49.2 &&
        cube.size[1] === 0.5 &&
        cube.size[0] > 20,
    );
    expect(header).toHaveLength(2);
    expect(minZ(header, 0)).toBeCloseTo(-58, 2);
    for (const x of [-21, 21]) expect(minZ(header, x)).toBeCloseTo(-54, 2);
  });

  it("keeps ten window strips in place and connects their backs to the folded face", () => {
    const window = cubes.filter(
      (cube) =>
        swatch(cube, 12) &&
        cube.origin[1] >= 60 &&
        cube.origin[1] < 62.5 &&
        cube.origin[2] < -50,
    );
    expect(window).toHaveLength(10);
    for (const [i, cube] of window.entries()) {
      const u = (16 + i + 0.5) / 32;
      const front = -59 + 6 * u;
      expect(cube.origin[0]).toBe(-9.5);
      expect(cube.origin[1]).toBe(60 + i * 0.25);
      expect(cube.origin[2]).toBeCloseTo(front - 0.1, 2);
      expect(cube.size.slice(0, 2)).toEqual([13, 0.25]);
      expect(cube.origin[2] + cube.size[2]).toBeGreaterThan(
        front + (4 * (1 - u) * 9.5) / 21,
      );
    }
  });

  // Positions from origin/refactor/camper-front-split, before the cap fold.
  it("preserves the roof lip and five lamp bases, lenses and four domes", () => {
    const lip = cubes.filter(
      (cube) =>
        cube.origin[1] === 63.4 && cube.size[0] > 48 && cube.origin[2] < -53,
    );
    expect(lip.map(placement)).toEqual([
      {
        origin: [-24.2, 63.4, -53.3],
        size: [48.4, 0.7, 1],
        rotation: undefined,
      },
    ]);
    const bases = cubes.filter(
      (cube) =>
        swatch(cube, 10) && cube.origin[1] === 63.9 && cube.origin[2] < -52,
    );
    const lenses = cubes.filter(
      (cube) =>
        swatch(cube, 34) && cube.origin[1] === 63.9 && cube.origin[2] < -52,
    );
    const domes = cubes.filter(
      (cube) =>
        swatch(cube, 34) && cube.origin[1] === 64.7 && cube.origin[2] < -52,
    );
    expect(bases.map(placement)).toEqual(
      [20.6, 5.1, -1.4, -6.9, -22.4].map((x, i) => ({
        origin: [x, 63.9, -53.1],
        size: [i === 2 ? 2.8 : 1.8, 0.2, 1.2],
        rotation: undefined,
      })),
    );
    expect(lenses.map(placement)).toEqual(
      [20.8, 5.3, -1.2, -6.7, -22.2].map((x, i) => ({
        origin: [x, 63.9, -53],
        size: [i === 2 ? 2.4 : 1.4, 0.8, 1],
        rotation: undefined,
      })),
    );
    expect(domes.map(placement)).toEqual(
      [21.1, 5.6, -6.4, -21.9].map((x) => ({
        origin: [x, 64.7, -52.8],
        size: [0.8, 0.3, 0.6],
        rotation: undefined,
      })),
    );
  });
});
