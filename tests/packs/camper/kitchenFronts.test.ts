import { expect, it } from "vitest";
import { defined } from "../../support/defined";
import { bone, bones } from "./helpers";

it("builds two closed drawer boxes before glass with a seam and aisle clearance", () => {
  for (const [name, y] of [
    ["drawer_bottom", 17.25],
    ["drawer_top", 22.65],
  ] as const) {
    const drawer = bone(name);
    expect(drawer.parent).toBe("body");
    expect(drawer.pivot).toEqual([-9, y, 16.45]);
    expect(drawer.cubes).toHaveLength(10);
    expect(bones.indexOf(drawer)).toBeLessThan(bones.indexOf(bone("glass")));
    const cubes = drawer.cubes ?? [];
    expect(cubes[0]?.origin).toEqual([-9, y, 9.6]);
    expect(cubes[0]?.size).toEqual([0.35, 5.2, 13.7]);
    expect(
      8 -
        Math.max(
          ...cubes.map(
            (c) =>
              defined(c.origin[0], "origin axis 0") +
              defined(c.size[0], "size axis 0"),
          ),
        ),
    ).toBeCloseTo(16.22);
    for (const c of cubes) {
      expect(
        defined(c.origin[1], "origin axis 1") +
          defined(c.size[1], "size axis 1"),
      ).toBeLessThan(29);
      expect(
        defined(c.origin[2], "origin axis 2") +
          defined(c.size[2], "size axis 2"),
      ).toBeLessThan(24);
    }
    expect(cubes.slice(6).map((c) => c.size)).toEqual([
      [10, 4.5, 0.2],
      [10, 4.5, 0.2],
      [0.2, 4.5, 12.9],
      [10, 0.2, 12.9],
    ]);
  }
  expect(22.65 - (17.25 + 5.2)).toBeCloseTo(0.2);
});

it("leaves the drawer cavity hollow behind the closed fronts", () => {
  const lo = [-19.2, 17.2, 9.5];
  const hi = [-8.9, 27.9, 23.4];
  for (const c of bone("body").cubes ?? []) {
    if (c.rotation) continue;
    expect(
      c.origin.every(
        (v, i) => v < (hi[i] ?? 0) && v + (c.size[i] ?? 0) > (lo[i] ?? 0),
      ),
      JSON.stringify(c.origin),
    ).toBe(false);
  }
});
