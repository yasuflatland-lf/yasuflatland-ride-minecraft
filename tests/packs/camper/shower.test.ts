import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bone, turn } from "./helpers";

describe("camper furniture model (ADR 0093)", () => {
  it("hinges the closed shower-toilet door on its rear edge at the aisle", () => {
    const door = bone("shower_door");
    expect(door.pivot).toEqual([-8, 0, 54]);
    expect(door.parent).toBe("body");
    expect(door.rotation).toBeUndefined();
    expect(door.cubes?.length).toBeGreaterThan(0);
    for (const cube of door.cubes ?? []) {
      const [ox = 0, , oz = 0] = cube.origin;
      const [sx = 0, , sz = 0] = cube.size;
      expect(oz).toBeGreaterThanOrEqual(42);
      expect(oz + sz).toBeLessThanOrEqual(54);
      expect(ox).toBeGreaterThanOrEqual(-9.2 - 1e-6);
      expect(ox + sx).toBeLessThanOrEqual(-7.4 + 1e-6);
    }
  });

  it("swings the open shower-toilet door into the aisle cell just in front of the rear wall, whose plate then takes taps on it (ADR 0118)", () => {
    const door = bone("shower_door");
    // The open angle of the camper's shower_door animation, checked above.
    const angle = -90;
    // The aisle cell (local 0, -3) spans x -8..8 and z 40..56; the rear wall cell's plate
    // starts at z 56, and the wall is laid in layers 1 to 3 (y 16..64).
    const WALL_FACE = 56;
    const GAP = 4;
    for (const cube of door.cubes ?? [])
      for (const corner of [0, 1].flatMap((i) =>
        [0, 1].flatMap((j) =>
          [0, 1].map((k) =>
            [i, j, k].map(
              (n, axis) =>
                (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
            ),
          ),
        ),
      )) {
        const [ox = 0, oy = 0, oz = 0] = turn(corner, door.pivot, [
          0,
          angle,
          0,
        ]);
        expect(ox).toBeGreaterThanOrEqual(-8 - 1e-6);
        expect(ox).toBeLessThanOrEqual(8 + 1e-6);
        expect(oy).toBeGreaterThanOrEqual(16);
        expect(oy).toBeLessThanOrEqual(64);
        expect(oz).toBeGreaterThanOrEqual(WALL_FACE - GAP);
        expect(oz).toBeLessThanOrEqual(WALL_FACE);
      }
  });
});

const showerRanges = JSON.parse(
  readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
).shower.body as number[];
const showerBody = () =>
  (bone("body").cubes ?? []).slice(
    showerRanges[0] ?? 0,
    (showerRanges[1] ?? -1) + 1,
  );

it("centres the wide shower underside at the unchanged spray locator", () => {
  expect(bone("body").locators?.shower_head).toEqual([-20.5, 44.5, 53.75]);
  const underside = showerBody().filter(
    (c) => c.origin[1] === 44.5 && c.size[1] === 0.13,
  );
  expect(underside).toHaveLength(32);
  const bounds = [0, 2].map((axis) => [
    Math.min(...underside.map((c) => c.origin[axis] ?? 0)),
    Math.max(
      ...underside.map((c) => (c.origin[axis] ?? 0) + (c.size[axis] ?? 0)),
    ),
  ]);
  // Each emitted origin and size is rounded independently to 0.001 model px.
  expect(
    Math.abs(((bounds[0]?.[0] ?? 0) + (bounds[0]?.[1] ?? 0)) / 2 + 20.5),
  ).toBeLessThanOrEqual(0.001);
  expect(
    Math.abs(((bounds[1]?.[0] ?? 0) + (bounds[1]?.[1] ?? 0)) / 2 - 53.75),
  ).toBeLessThanOrEqual(0.001);
});

it("keeps every new tile and handset corner inside the shower cell", () => {
  const fixtures = showerBody().slice(10);
  expect(fixtures.length).toBeGreaterThan(900);
  for (const cube of fixtures)
    for (let i = 0; i < 8; i++) {
      const p = cube.origin.map(
        (v, axis) => v + ((i >> axis) & 1) * (cube.size[axis] ?? 0),
      );
      const corner =
        cube.rotation && cube.pivot ? turn(p, cube.pivot, cube.rotation) : p;
      for (const [axis, lo, hi] of [
        [0, -22.8, -8.6],
        [1, 16.3, 60.5],
        [2, 41.1, 55.53],
      ]) {
        expect(corner[axis ?? 0]).toBeGreaterThanOrEqual((lo ?? 0) - 0.002);
        expect(corner[axis ?? 0]).toBeLessThanOrEqual((hi ?? 0) + 0.002);
      }
    }
});

it("keeps all shower-owned cubes inside the camper shell", () => {
  for (const cube of showerBody())
    for (let i = 0; i < 8; i++) {
      const point = cube.origin.map(
        (value, axis) => value + ((i >> axis) & 1) * (cube.size[axis] ?? 0),
      );
      const corner =
        cube.rotation && cube.pivot
          ? turn(point, cube.pivot, cube.rotation)
          : point;
      for (const [axis, lo, hi] of [
        [0, -24, 24],
        [1, 16, 61],
        [2, 40.5, 56],
      ] as const) {
        expect(corner[axis]).toBeGreaterThanOrEqual(lo - 0.002);
        expect(corner[axis]).toBeLessThanOrEqual(hi + 0.002);
      }
    }
});
