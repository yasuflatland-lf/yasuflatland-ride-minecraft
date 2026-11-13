import { describe, expect, it } from "vitest";
import { bone, WHEELS } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("puts wheel pivots at the axle centers and hover locators directly below after mirroring", () => {
    const locators = bone("body").locators;
    expect(Object.keys(locators ?? {}).sort()).toEqual(
      [
        "hover_fl",
        "hover_fr",
        "hover_rl",
        "hover_rr",
        "exhaust",
        "shower_head",
      ].sort(),
    );
    expect(locators?.exhaust).toEqual([12, 4, 52]);
    expect(locators?.shower_head).toEqual([-20.5, 44.5, 53.75]);
    for (const [name, x, z] of [
      ["fl", 21.4, -31.5],
      ["fr", -21.4, -31.5],
      ["rl", 21.4, 31],
      ["rr", -21.4, 31],
    ] as const) {
      const wheel = bone(`wheel_${name}`);
      expect(wheel.pivot).toEqual([x, 7.8, z]);
      expect(locators?.[`hover_${name}`]).toEqual([x, -0.5, z]);
      expect(wheel.cubes).toHaveLength(64);
      expect(new Set(wheel.cubes?.map((c) => c.uv.north?.uv[0])).size).toBe(4);
      for (const cube of wheel.cubes ?? []) {
        expect(cube.pivot?.[1]).toBe(7.8);
        expect(cube.rotation).toBeDefined();
      }
    }
    expect(bone("door_entry").pivot).toEqual([-24, 0, -7]);
  });

  it("keeps every rotated wheel cube above ground with the tires touching it", () => {
    for (const name of WHEELS) {
      const heights = (bone(name).cubes ?? []).flatMap((cube) => {
        const angle = ((cube.rotation?.[0] ?? 0) * Math.PI) / 180;
        const py = cube.pivot?.[1] ?? 0;
        const pz = cube.pivot?.[2] ?? 0;
        return Array.from({ length: 8 }, (_, corner) => {
          const y =
            (cube.origin[1] ?? 0) + ((corner >> 1) & 1) * (cube.size[1] ?? 0);
          const z =
            (cube.origin[2] ?? 0) + ((corner >> 2) & 1) * (cube.size[2] ?? 0);
          return py + (y - py) * Math.cos(angle) - (z - pz) * Math.sin(angle);
        });
      });
      // Geometry coordinates are rounded to three decimal places by the generator.
      expect(
        heights.every((y) => y >= -0.0005),
        name,
      ).toBe(true);
      expect(Math.min(...heights), name).toBeCloseTo(0, 3);
      expect(Math.max(...heights), name).toBeCloseTo(15.6, 3);
    }
  });
});
