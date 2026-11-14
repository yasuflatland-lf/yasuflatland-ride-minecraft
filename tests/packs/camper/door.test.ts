import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bone, swatch, turn } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("aligns both entry handles half a pixel below the stripe (#596)", () => {
    const door = bone("door_entry");
    expect(door.pivot).toEqual([-24, 0, -7]);
    const handles = (door.cubes ?? []).filter(
      (c) => swatch(c, "chrome") && c.origin[2] === 4.5 && c.size[2] === 1.5,
    );
    expect(handles).toHaveLength(2);
    expect(handles.map((c) => c.origin[0] ?? 0).sort((a, b) => a - b)).toEqual([
      -24.6, -23,
    ]);
    for (const c of handles) {
      expect(c.origin[1]).toBe(28);
      expect(c.size).toEqual([0.6, 1, 1.5]);
    }
    const stripe = (door.cubes ?? []).filter((c) => swatch(c, "stripe"));
    expect(stripe).toHaveLength(1);
    expect(stripe[0]?.origin[1]).toBe(29.5);
  });
});

it("keeps the rotated interior details inside the original entry slab throughout its swing", () => {
  const door = bone("door_entry");
  const details = (door.cubes ?? []).slice(32);
  expect(details).toHaveLength(212);
  const corners = details.flatMap((cube) =>
    [0, 1].flatMap((x) =>
      [0, 1].flatMap((y) =>
        [0, 1].map((z) => {
          const point = [x, y, z].map(
            (n, axis) => (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
          );
          return cube.pivot && cube.rotation
            ? turn(point, cube.pivot, cube.rotation)
            : point;
        }),
      ),
    ),
  );
  for (const point of corners) {
    for (const [axis, low, high] of [
      [0, -24, -23],
      [1, 12, 54],
      [2, -6.9, 6.9],
    ]) {
      expect(point[axis ?? 0]).toBeGreaterThanOrEqual((low ?? 0) - 0.001);
      expect(point[axis ?? 0]).toBeLessThanOrEqual((high ?? 0) + 0.001);
    }
  }
  fc.assert(
    fc.property(fc.double({ min: -100, max: 0, noNaN: true }), (angle) => {
      for (const point of corners) {
        const swung = turn(point, door.pivot, [0, angle, 0]);
        // The right-wall swing stays outside both the cab seat and central aisle.
        expect(swung[0]).toBeLessThan(-22.9);
        expect(swung[0]).toBeLessThan(-8);
      }
    }),
    { numRuns: 20 },
  );
});
