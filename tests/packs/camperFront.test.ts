import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Cube {
  origin: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  pivot?: [number, number, number];
  uv: { north: { uv: [number, number] } };
}
const geometry = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
    "utf8",
  ),
)["minecraft:geometry"][0];
const cubes: Cube[] = geometry.bones.flatMap(
  (bone: { cubes?: Cube[] }) => bone.cubes ?? [],
);
const front = cubes.filter((c) => c.origin[2] < -52 && c.origin[1] < 33);
const slot = (c: Cube, value: number) => c.uv.north.uv[0] === value;
const middleY = (c: Cube) => c.origin[1] + c.size[1] / 2;
const slope = Math.tan((5 * Math.PI) / 180);
const sizes = (items: Cube[]) => {
  const counts: Record<string, number> = {};
  for (const c of items) {
    const key = c.size.join(",");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

describe("camper front lean and ridge", () => {
  it("leans the hood edge, upper grille and bumper forward by five degrees", () => {
    const groups = [
      front.filter(
        (c) => slot(c, 10) && c.size[0] === 0.9 && c.origin[1] >= 29.5,
      ),
      front.filter(
        (c) =>
          slot(c, 12) &&
          Math.abs(c.size[0] - Math.hypot(19.5, 2)) < 0.001 &&
          (c.pivot?.[0] ?? 0) > 0,
      ),
      front.filter((c) => slot(c, 5) && c.size[0] === 47),
    ];
    for (const group of groups) {
      expect(group.length).toBeGreaterThan(5);
      const ordered = group.sort((a, b) => middleY(a) - middleY(b));
      const first = ordered[0] as Cube;
      for (const c of ordered) {
        expect(
          Math.abs(
            c.origin[2] -
              first.origin[2] +
              (middleY(c) - middleY(first)) * slope,
          ),
        ).toBeLessThan(0.002);
        expect(c.size[1]).toBeLessThanOrEqual(0.5);
      }
      expect((ordered.at(-1) as Cube).origin[2]).toBeLessThan(first.origin[2]);
    }
  });

  it("folds the upper backing into two halves with the center two pixels ahead", () => {
    const backing = front.filter(
      (c) => slot(c, 12) && Math.abs(c.size[0] - Math.hypot(19.5, 2)) < 0.001,
    );
    expect(backing).toHaveLength(46);
    for (const c of backing) {
      const angle = ((c.rotation?.[1] ?? 0) * Math.PI) / 180;
      expect(Math.abs(angle)).toBeCloseTo(Math.atan(2 / 19.5), 4);
      const [px, , pz] = c.pivot as [number, number, number];
      const ends = [c.origin[0], c.origin[0] + c.size[0]]
        .map((x) => ({
          x: px + (x - px) * Math.cos(angle),
          z: pz - (x - px) * Math.sin(angle),
        }))
        .sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
      const center = ends[0] as { x: number; z: number };
      const edge = ends[1] as { x: number; z: number };
      expect(Math.abs(center.x)).toBeLessThan(1);
      expect(Math.abs(edge.x)).toBeCloseTo(19.5, 1);
      expect(edge.z - center.z).toBeCloseTo(2, 1);
    }
  });

  it("preserves the measured lamp and slat cube counts and sizes", () => {
    // Measured from the generated geometry before issue #1068.
    expect(sizes(front.filter((c) => slot(c, 14)))).toEqual({
      "4.2,0.414,0.3": 32,
    });
    expect(sizes(front.filter((c) => slot(c, 15)))).toEqual({
      "2.2,0.217,0.3": 32,
    });
    const bezels = front.filter(
      (c) => slot(c, 10) && (c.size[0] === 5.2 || c.size[0] === 2.8),
    );
    expect(sizes(bezels)).toEqual({ "5.2,0.512,0.5": 32, "2.8,0.276,0.4": 32 });
    const expected: Record<string, number> = {};
    for (const height of [0.3, 0.5]) {
      expected[`0.5,${height},0.4`] = 196;
      expected[`4.243,${height},1`] = 14;
      expected[`11,${height},0.4`] = 14;
      for (const width of [17.04, 18.24, 19.44, 20.64, 21.84, 23.04]) {
        expected[`${width},${height},0.3`] = 1;
      }
    }
    const slats = front.filter((c) => slot(c, 11));
    expect(slats).toHaveLength(460);
    expect(sizes(slats)).toEqual(expected);
    for (const c of front.filter((c) => slot(c, 14) || slot(c, 15))) {
      expect(c.rotation?.[0] ?? 0).toBe(0);
      expect(c.rotation?.[1] ?? 0).toBe(0);
    }
  });

  it("keeps the lower grille and lamp pods on planes across their width", () => {
    for (const depth of [1.2, 1.3]) {
      const panels = front.filter(
        (c) => slot(c, 7) && c.size[2] === depth && c.size[1] === 0.5,
      );
      expect(panels).toHaveLength(depth === 1.2 ? 20 : 40);
      for (const c of panels) {
        expect(c.origin[2]).toBeCloseTo(
          -55 - depth + (33 - middleY(c)) * slope,
          3,
        );
        expect(c.rotation).toBeUndefined();
      }
    }
  });

  it("recesses only the floor and dashboard front edges to clear the lean", () => {
    const floor = cubes.filter(
      (c) => slot(c, 21) && c.origin[1] === 13 && c.origin[2] < -50,
    );
    expect(floor.length).toBeGreaterThan(0);
    for (const c of floor) expect(c.origin[2]).toBeCloseTo(-55 + 20 * slope, 3);
    const dash = cubes.filter(
      (c) =>
        slot(c, 17) &&
        c.origin[1] === 16 &&
        c.size[0] === 46 &&
        c.origin[2] < -50,
    );
    expect(dash).toHaveLength(1);
    expect(dash[0]?.origin[2]).toBeCloseTo(-55 + 17 * slope, 3);
    expect((dash[0] as Cube).origin[2] + (dash[0] as Cube).size[2]).toBeCloseTo(
      -48,
      3,
    );
  });

  it("keeps the sill rear edge at the windshield foot and its nose in a shallow V", () => {
    const sill = cubes.filter(
      (c) =>
        slot(c, 0) &&
        c.origin[1] === 33 &&
        c.size[0] === 0.5 &&
        c.origin[2] < -53.5,
    );
    expect(sill.length).toBeGreaterThan(100);
    for (const c of sill)
      expect(c.origin[2] + c.size[2]).toBeLessThanOrEqual(-53.499);
    for (const x of [0.25, 10.25, 19.25]) {
      const strip = sill.filter((c) => Math.abs(c.origin[0] + 0.25) === x);
      expect(Math.min(...strip.map((c) => c.origin[2]))).toBeCloseTo(
        -56 - 2 * (1 - x / 24),
        2,
      );
      expect(
        Math.max(...strip.map((c) => c.origin[2] + c.size[2])),
      ).toBeCloseTo(-53.5, 3);
    }
  });
});
