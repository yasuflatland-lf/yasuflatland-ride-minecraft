import { describe, expect, it } from "vitest";
import type { Bone, Cube } from "../support/geometry";
import { findCoplanarFaces } from "./coplanarFaces.support";

const id = "geometry.test.overlap";
const description = { identifier: id, texture_width: 6, texture_height: 2 };
const texture = {
  width: 3,
  height: 1,
  pixels: Buffer.from([0, 0, 0, 255, 13, 0, 0, 255, 255, 0, 0, 0]),
};
const cube = (u = 0, side = "up", y = 0): Cube => ({
  origin: [0, y, 0],
  size: [1, 1, 1],
  uv: { [side]: { uv: [u, 0], uv_size: [0.25, 0.25] } },
});
const twoCubes = (first: Cube, second: Cube): Bone[] => [
  { name: "first", cubes: [first] },
  { name: "second", cubes: [second] },
];
const find = (bones: Bone[], identifier = id) =>
  findCoplanarFaces(
    { description: { ...description, identifier }, bones },
    texture,
  );

describe("coplanar face findings", () => {
  it("ignores overlapping faces that sample the same color", () => {
    expect(find(twoCubes(cube(), cube()))).toEqual([]);
  });

  it("reports an overlap when scaled subtexel UVs sample different colors", () => {
    expect(find(twoCubes(cube(), cube(2)))).toMatchObject([
      { a: { bone: "first" }, b: { bone: "second" }, area: 1 },
    ]);
  });

  it("ignores a face that samples only transparent texels", () => {
    expect(find(twoCubes(cube(), cube(4)))).toEqual([]);
  });

  it("ignores mutually exclusive bones in the same slot", () => {
    expect(
      find(
        [
          { name: "end0_mug", cubes: [cube()] },
          { name: "end0_book", cubes: [cube(2)] },
        ],
        "geometry.yasu_ride.board_decor_pair",
      ),
    ).toEqual([]);
  });

  it("inherits the exclusion from the nearest ancestor with a slot", () => {
    expect(
      find(
        [
          { name: "chair_form" },
          { name: "chair_leg", parent: "chair_form" },
          { name: "chair_foot", parent: "chair_leg", cubes: [cube()] },
          { name: "table_form", cubes: [cube(2)] },
        ],
        "geometry.yasu_ride.beach_chair",
      ),
    ).toEqual([]);
  });

  it("ignores a down pair on the ground and reports the pair above ground", () => {
    const bones = twoCubes(cube(0, "down"), cube(2, "down"));
    expect(find(bones)).toEqual([]);
    bones.push({
      name: "lower",
      cubes: [{ origin: [0, -1, 0], size: [1, 1, 1], uv: [0, 0] }],
    });
    expect(find(bones)).toHaveLength(1);
  });

  it("keeps thin overlaps when a tilted plane differs within tolerance", () => {
    const first: Cube = {
      ...cube(),
      size: [100, 0, 1],
      pivot: [0, 0, 0],
      rotation: [-45, 0, 0],
    };
    const second: Cube = {
      ...first,
      origin: [0, 0.00009, 0.99998],
      uv: cube(2).uv,
    };
    expect(find(twoCubes(first, second))[0]?.area).toBeCloseTo(0.002, 8);
  });

  it("finds overlaps across the offset bucket boundary once", () => {
    expect(
      find(twoCubes(cube(0, "up", 0.00049), cube(2, "up", 0.00051))),
    ).toHaveLength(1);
    expect(
      find(twoCubes(cube(0, "up", 0.00049), cube(2, "up", 0.00061))),
    ).toEqual([]);
  });
});
