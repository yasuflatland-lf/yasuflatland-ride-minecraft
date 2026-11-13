import { describe, expect, it } from "vitest";
import { bone, turn } from "./helpers";

describe("camper furniture model (ADR 0093)", () => {
  it("hinges both fridge doors at the fridge's front end on its aisle face, the shorter top door over the taller bottom one, and swings each open into the aisle cell beside the fridge (ADR 0123)", () => {
    const heights: number[] = [];
    for (const name of ["fridge_bottom_door", "fridge_top_door"]) {
      const door = bone(name);
      expect(door.pivot).toEqual([-8.3, 0, -23.3]);
      expect(door.parent).toBe("body");
      expect(door.rotation).toBeUndefined();
      expect(door.cubes?.length).toBeGreaterThan(0);
      const ys: number[] = [];
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
          const [cx = 0, cy = 0, cz = 0] = corner;
          ys.push(cy);
          // Shut, the door covers the fridge's aisle face, in the fridge's cell row (z = 1).
          expect(cx, name).toBeGreaterThanOrEqual(-9 - 1e-6);
          expect(cx, name).toBeLessThanOrEqual(-7.5);
          expect(cz, name).toBeGreaterThanOrEqual(-24);
          expect(cz, name).toBeLessThanOrEqual(-8);
          expect(cy, name).toBeGreaterThanOrEqual(16);
          expect(cy, name).toBeLessThanOrEqual(49);
          // Open, it stands in the aisle cell, local x 0, beside the fridge.
          const [ox = 0, , oz = 0] = turn(corner, door.pivot, [0, 90, 0]);
          expect(ox, name).toBeGreaterThanOrEqual(-9 - 1e-6);
          expect(ox, name).toBeLessThanOrEqual(8);
          expect(oz, name).toBeGreaterThanOrEqual(-24);
          expect(oz, name).toBeLessThanOrEqual(-8);
        }
      heights.push(Math.max(...ys) - Math.min(...ys));
    }
    const [bottom = 0, top = 0] = heights;
    expect(top).toBeLessThan(bottom);
  });
});
