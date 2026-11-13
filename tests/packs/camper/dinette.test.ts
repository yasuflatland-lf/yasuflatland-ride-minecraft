import { describe, expect, it } from "vitest";
import { bone } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("keeps the facing dinette on the left behind the passenger, clear of the bed and side walls", () => {
    for (const name of ["seat_0", "seat_1", "headlights"]) {
      expect(bone(name).cubes?.length).toBeGreaterThan(0);
    }
    expect(bone("seat_0").cubes?.every((c) => (c.origin[0] ?? 0) < 0)).toBe(
      true,
    );
    expect(bone("seat_1").cubes?.every((c) => (c.origin[0] ?? 0) > 0)).toBe(
      true,
    );
    for (const [name, z0, z1] of [
      ["seat_2", -24, -10],
      ["seat_3", 10, 24],
    ] as const) {
      const cubes = bone(name).cubes ?? [];
      expect(cubes.length).toBeGreaterThan(0);
      expect(Math.min(...cubes.map((c) => c.origin[0] ?? 0))).toBe(8);
      expect(
        Math.max(...cubes.map((c) => (c.origin[0] ?? 0) + (c.size[0] ?? 0))),
      ).toBeCloseTo(23, 3);
      expect(Math.min(...cubes.map((c) => c.origin[2] ?? 0))).toBe(z0);
      expect(
        Math.max(...cubes.map((c) => (c.origin[2] ?? 0) + (c.size[2] ?? 0))),
      ).toBeCloseTo(z1, 3);
      for (const c of cubes) {
        expect(c.origin[1]).toBeGreaterThanOrEqual(16);
      }
    }
  });
});
