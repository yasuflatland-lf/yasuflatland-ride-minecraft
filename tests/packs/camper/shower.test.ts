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
