import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { bone, end } from "./helpers";

it("builds the piped dinette, bed and bunk inside their original furniture cells", () => {
  expect(bone("seat_2").cubes).toHaveLength(22);
  expect(bone("seat_3").cubes).toHaveLength(15);
  expect(bone("bunk").cubes).toHaveLength(20);
  const areas: Record<string, Record<string, number[]>> = JSON.parse(
    readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
  );
  const bed = ["bed_bunk", "soft"].flatMap((area) => {
    const [first = 0, last = -1] = areas[area]?.body ?? [];
    return (bone("body").cubes ?? []).slice(first, last + 1);
  });
  expect(bed).toHaveLength(30);
  for (const c of bed) {
    expect(c.size.every((n) => n > 0)).toBe(true);
    for (const [axis, low, high] of [
      [0, 8, 23],
      [1, 16, 26],
      [2, 24, 55],
    ] as const) {
      expect(c.origin[axis]).toBeGreaterThanOrEqual(low);
      expect(end(c, axis)).toBeLessThanOrEqual(high);
    }
  }
  expect(Math.max(...bed.map((c) => end(c, 1)))).toBe(26);
  for (const name of ["seat_2", "seat_3", "bunk"]) {
    for (const c of bone(name).cubes ?? []) {
      expect(c.size.every((n) => n > 0)).toBe(true);
      expect(c.origin[0]).toBeGreaterThanOrEqual(8);
      expect(end(c, 0)).toBeLessThanOrEqual(23);
    }
  }
});
