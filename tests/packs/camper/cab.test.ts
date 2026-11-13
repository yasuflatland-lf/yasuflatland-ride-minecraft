import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Triple, turn } from "../../support/geometry";
import { bone, extent, near, swatch } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("keeps every shipped cab body cube below the sill after numeric serialization", () => {
    const selection = (
      JSON.parse(
        readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
      ) as { cab: { body: [number, number] | [number, number][] } }
    ).cab.body;
    const ranges =
      typeof selection[0] === "number"
        ? [selection as [number, number]]
        : (selection as [number, number][]);
    const body = bone("body").cubes ?? [];
    expect(ranges.length).toBeGreaterThan(0);
    for (const [first, last] of ranges)
      for (let index = first; index <= last; index++) {
        const c = body[index];
        if (!c) throw new Error("Missing cab cube");
        const top = Math.max(
          ...extent(c, 0).flatMap((x) =>
            extent(c, 1).flatMap((y) =>
              extent(c, 2).map(
                (z) =>
                  turn(
                    [x, y, z],
                    (c.pivot ?? [0, 0, 0]) as Triple,
                    (c.rotation ?? [0, 0, 0]) as Triple,
                  )[1] ?? 0,
              ),
            ),
          ),
        );
        expect(top, JSON.stringify(c.origin)).toBeLessThanOrEqual(35 + 1e-8);
      }
  });

  it("preserves the 34.89999 core datum in the shipped geometry", () => {
    expect(
      (bone("body").cubes ?? []).filter(
        (c) =>
          !c.rotation &&
          Math.abs((c.origin[1] ?? 0) + (c.size[1] ?? 0) - 34.89999) < 1e-8,
      ),
    ).toHaveLength(28);
  });

  it("removes the obsolete black ledge above the new dashboard shelf", () => {
    expect(
      (bone("body").cubes ?? []).filter(
        (c) =>
          !c.rotation &&
          near(c.origin[1], 35.65) &&
          near(c.size[0], 0.5) &&
          near(c.size[1], 0.25),
      ),
    ).toHaveLength(0);
  });

  it("puts the steering wheel and column on the right in front of the driver", () => {
    const steering = bone("steering");
    expect(steering.pivot).toEqual([-12, 33, -41]);
    expect(steering.cubes?.length).toBeGreaterThan(0);
    for (const cube of steering.cubes ?? []) {
      expect((cube.origin[0] ?? 0) + (cube.size[0] ?? 0) / 2).toBeLessThan(0);
    }
  });

  // The wheel's cubes are built in its own plane and only moved by the pivot, so x and y
  // relative to the pivot are the wheel's own axes.
  it("keeps the steering wheel inside its rim (sightline)", () => {
    const steering = bone("steering");
    for (const cube of steering.cubes ?? []) {
      const fromPivot = (axis: number) =>
        (cube.origin[axis] ?? 0) +
        (cube.size[axis] ?? 0) / 2 -
        (steering.pivot[axis] ?? 0);
      expect(Math.hypot(fromPivot(0), fromPivot(1))).toBeLessThanOrEqual(
        7.2 + 0.5,
      );
    }
  });

  it("preserves the existing steering lean and column geometry", () => {
    const steering = bone("steering");
    expect(steering.rotation).toEqual([65, 0, 0]);
    expect(steering.cubes).toHaveLength(115);
    // Texture packing can relocate UVs; the retained wheel and column shapes cannot change.
    const shape = (steering.cubes ?? []).map(
      ({ origin, size, pivot, rotation }) => ({
        origin,
        size,
        pivot,
        rotation,
      }),
    );
    expect(
      createHash("sha256").update(JSON.stringify(shape)).digest("hex"),
    ).toBe("0bc40ece9eb633ea11234f6df25f6183bac452f9538c7aa0eacc1a91c0360d54");
    const columns = (steering.cubes ?? []).filter((cube) =>
      near(cube.size[2], 15.4),
    );
    expect(columns).toHaveLength(1);
    expect(columns[0]?.origin).toEqual([-12.7, 32.3, -57]);
    expect(columns[0]?.size).toEqual([1.4, 1.4, 15.4]);
  });

  it("removes the green engine cover between the cab seats", () => {
    const engineCovers = (bone("body").cubes ?? []).filter((cube) => {
      if (!swatch(cube, "dash") && !swatch(cube, "dash_pad")) return false;
      const [x0, x1] = extent(cube, 0);
      const [y0, y1] = extent(cube, 1);
      const [z0, z1] = extent(cube, 2);
      return (
        x0 >= -6 &&
        x1 <= 6 &&
        y0 >= 16 &&
        y1 <= 24.201 &&
        z0 >= -48 &&
        z1 >= -37
      );
    });
    expect(engineCovers).toEqual([]);
  });
});
