import { describe, expect, it } from "vitest";
import {
  ALUMINIUM_SLOT,
  baseOrigin,
  bone,
  bones,
  type Cube,
  cubeCenter,
  end,
  geometry,
  swatch,
  swatchUv,
} from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("replaces the mid-body amber box with symmetric static rear signals (#596)", () => {
    const body = bone("body").cubes ?? [];
    const amber = bones
      .flatMap((b) => b.cubes ?? [])
      .filter((c) => swatch(c, "amber"));
    expect(
      amber.filter(
        (c) =>
          Math.abs(cubeCenter(c, 0)) >= 23.5 &&
          cubeCenter(c, 1) >= 50 &&
          cubeCenter(c, 1) < 60,
      ),
    ).toEqual([]);
    expect(
      amber.filter(
        (c) => Math.abs(cubeCenter(c, 2)) <= 40 && (c.origin[1] ?? 0) < 60.4,
      ),
    ).toEqual([]);
    for (const material of ["chrome", "amber"]) {
      const signals = body.filter(
        (c) =>
          swatch(c, material) &&
          Math.abs(Math.abs(cubeCenter(c, 0)) - 22.9) < 0.05 &&
          Math.abs(cubeCenter(c, 1) - 15) < 0.05 &&
          cubeCenter(c, 2) > 50,
      );
      const left = signals.filter((c) => cubeCenter(c, 0) < 0);
      const right = signals.filter((c) => cubeCenter(c, 0) > 0);
      expect(left.length).toBeGreaterThan(0);
      expect(left.map((c) => c.size)).toEqual(right.map((c) => c.size));
      for (const c of left)
        expect(
          right.some(
            (r) =>
              Math.abs(cubeCenter(c, 0) + cubeCenter(r, 0)) < 0.002 &&
              cubeCenter(c, 2) === cubeCenter(r, 2),
          ),
        ).toBe(true);
    }
    expect(
      (bone("headlights").cubes ?? []).filter((c) => swatch(c, "amber")),
    ).toEqual([]);
  });

  it("lights only the roof clearance, rear roof, and tail lamps with the headlights (ADR 0184)", () => {
    const lit: Record<string, string[]> = {
      headlights: ["lens", "marker_amber", "marker_red"],
      ceiling_lights: ["dome"],
    };
    const litSwatches = Object.values(lit).flat();
    for (const b of bones)
      for (const c of b.cubes ?? [])
        for (const name of litSwatches)
          if (swatch(c, name))
            expect(lit[b.name] ?? [], `${b.name} ${name}`).toContain(name);
    const lampCenters = (name: string) =>
      [
        ...new Set(
          (bone("headlights").cubes ?? [])
            .filter((c) => swatch(c, name))
            .map((c) =>
              [0, 1, 2].map((axis) => cubeCenter(c, axis).toFixed(2)).join(),
            ),
        ),
      ].sort();
    const at = (points: number[][]) =>
      points.map((p) => p.map((v) => v.toFixed(2)).join()).sort();
    const roofLip = [-21.5, -6, 0, 6, 21.5];
    expect(lampCenters("marker_amber")).toEqual(
      at([
        ...roofLip.map((x) => [x, 64.3, -52.5]),
        ...roofLip.filter((x) => x !== 0).map((x) => [x, 64.85, -52.5]),
      ]),
    );
    expect(lampCenters("marker_red")).toEqual(
      at([
        ...[-12, -4, 4, 12].map((x) => [x, 61.8, 60.525]),
        ...[-19, 19].map((x) => [x, 15, 59.11]),
      ]),
    );
  });
});
describe("camper rear-right vent lid (ADR 0146, 0157)", () => {
  const WHITE_SLOT = swatchUv("white")[0];
  const KHAKI_SLOT = swatchUv("khaki")[0];
  const STEEL_SLOT = swatchUv("steel")[0];
  const BLACK_SLOT = swatchUv("black")[0];
  const CHROME_SLOT = swatchUv("chrome")[0];
  const WALL_IN_SLOT = swatchUv("wall_in")[0];
  const TRIM_BEIGE_SLOT = swatchUv("trim_beige")[0];
  it("removes the rear-right pane and closes the outer wall, lining, and band", () => {
    expect(
      (bone("glass").cubes ?? []).filter(
        (c) =>
          (c.origin[0] ?? 0) < -23 && (c.origin[2] ?? 0) < 50 && end(c, 2) > 38,
      ),
    ).toEqual([]);
    for (const [slot, x] of [
      [WHITE_SLOT, -23.5],
      [WALL_IN_SLOT, -22.9],
      [KHAKI_SLOT, -24.05],
    ] as const) {
      expect(
        (bone("body").cubes ?? []).some(
          (c) =>
            c.uv.north?.uv[0] === slot &&
            [x, 42, 45].every(
              (v, axis) => v >= (c.origin[axis] ?? 0) && v <= end(c, axis),
            ),
        ),
      ).toBe(true);
    }
  });
  const lid = () =>
    (bone("body").cubes ?? []).filter(
      (c) =>
        end(c, 0) <= -24.0999 &&
        (c.origin[1] ?? 0) >= 36.5 &&
        end(c, 1) <= 48.5001 &&
        (c.origin[2] ?? 0) >= 40.5 &&
        end(c, 2) <= 49.5001,
    );
  const covers = (c: Cube, y: number, z: number) =>
    (c.origin[1] ?? 0) <= y &&
    y <= end(c, 1) &&
    (c.origin[2] ?? 0) <= z &&
    z <= end(c, 2);
  it("frames a grey-beige panel in a raised aluminium rim with cut corners", () => {
    const cubes = lid();
    for (const c of cubes)
      for (const face of Object.values(c.uv))
        if (face.uv[1] === baseOrigin[1])
          expect([
            TRIM_BEIGE_SLOT,
            STEEL_SLOT,
            BLACK_SLOT,
            CHROME_SLOT,
            ALUMINIUM_SLOT,
          ]).toContain(face.uv[0]);
        else {
          expect(face.uv[1]).toBeGreaterThan(baseOrigin[1]);
          expect(
            (face.uv[0] ?? 0) + (face.uv_size[0] ?? 0),
          ).toBeLessThanOrEqual(geometry.description.texture_width);
          expect(
            (face.uv[1] ?? 0) + (face.uv_size[1] ?? 0),
          ).toBeLessThanOrEqual(geometry.description.texture_height);
        }
    const rim = cubes.filter((c) =>
      [CHROME_SLOT, ALUMINIUM_SLOT].includes(c.uv.north?.uv[0] ?? -1),
    );
    for (const c of rim) {
      expect(c.origin[0]).toBeCloseTo(-24.5, 4);
      expect(end(c, 0)).toBeCloseTo(-24.1, 4);
    }
    for (const [axis, low, high] of [
      [1, 36.5, 48.5],
      [2, 40.5, 49.5],
    ] as const) {
      expect(Math.min(...rim.map((c) => c.origin[axis] ?? 0))).toBeCloseTo(
        low,
        4,
      );
      expect(Math.max(...rim.map((c) => end(c, axis)))).toBeCloseTo(high, 4);
    }
    for (const [y, z] of [
      [36.6, 40.6],
      [36.6, 49.4],
      [48.4, 40.6],
      [48.4, 49.4],
    ] as const)
      expect(cubes.filter((c) => covers(c, y, z))).toEqual([]);
    for (const c of cubes.filter((c) => c.uv.north?.uv[0] === TRIM_BEIGE_SLOT))
      expect(c.origin[0]).toBeCloseTo(-24.3, 4);
  });
  it("cuts two columns of twelve recessed slits above a plain lower part", () => {
    const slits = lid().filter((c) => c.uv.north?.uv[0] === BLACK_SLOT);
    expect(slits).toHaveLength(24);
    for (const c of slits) {
      expect(c.origin[0]).toBeCloseTo(-24.2, 4);
      expect(c.size[0]).toBeCloseTo(0.1, 4);
      expect(c.origin[1]).toBeGreaterThan(40);
    }
    const left = slits.filter((c) => end(c, 2) < 45);
    const right = slits.filter((c) => (c.origin[2] ?? 0) > 45);
    expect(left).toHaveLength(12);
    expect(right).toHaveLength(12);
    const panel = lid().filter((c) => c.uv.north?.uv[0] === TRIM_BEIGE_SLOT);
    for (const c of slits)
      expect(
        panel.some((p) =>
          covers(p, (c.origin[1] ?? 0) + 0.1, (c.origin[2] ?? 0) + 0.1),
        ),
      ).toBe(false);
  });
  it("adds a latch below the slits", () => {
    const steel = lid().filter((c) => c.uv.north?.uv[0] === STEEL_SLOT);
    const latch = steel.filter((c) => (c.size[2] ?? 0) > 1);
    expect(latch).toHaveLength(1);
    expect(end(latch[0] as Cube, 1)).toBeLessThan(40);
  });
});
