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
    expect(steering.pivot).toEqual([-14.29, 38.491, -42.8]);
    expect(steering.cubes?.length).toBeGreaterThan(0);
    for (const cube of steering.cubes ?? []) {
      expect((cube.origin[0] ?? 0) + (cube.size[0] ?? 0) / 2).toBeLessThan(0);
    }
  });

  it("keeps the steering wheel inside its rim (sightline)", () => {
    const steering = bone("steering");
    const wheel = steering.cubes ?? [];
    expect(wheel.length).toBeGreaterThan(100);
    for (const cube of wheel) {
      const localCenter = turn(
        cube.origin.map((v, i) => v + (cube.size[i] ?? 0) / 2) as Triple,
        (cube.pivot ?? [0, 0, 0]) as Triple,
        (cube.rotation ?? [0, 0, 0]) as Triple,
      );
      const center = turn(
        localCenter,
        steering.pivot as Triple,
        steering.rotation as Triple,
      );
      expect(Math.abs(center[0] + 14.29)).toBeLessThanOrEqual(6.33);
      const rimCenter: Triple = [
        -14.29,
        38.491 - (0.76 * Math.sqrt(3)) / 2,
        -42.8 - 0.76 / 2,
      ];
      const across = center[0] - rimCenter[0];
      const up =
        (center[1] - rimCenter[1]) * 0.5 -
        ((center[2] - rimCenter[2]) * Math.sqrt(3)) / 2;
      expect(Math.hypot(across, up)).toBeLessThanOrEqual(6.34);
    }
  });

  it("ends the steering column at the firewall beneath the raised dash (#422)", () => {
    const ranges = JSON.parse(
      readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
    );
    const first = ranges.steering.body[0];
    const columns = (bone("body").cubes ?? []).slice(first, first + 2);
    expect(columns).toHaveLength(2);
    const shaft = columns[0];
    expect(shaft).toBeDefined();
    if (!shaft) return;
    const start = shaft.pivot as Triple;
    const end = turn(
      [start[0] + (shaft.size[0] ?? 0), start[1], start[2]],
      start,
      shaft.rotation as Triple,
    );
    expect(start[1]).toBeLessThan(25);
    expect(start[2]).toBeLessThan(-50);
    expect(end[0]).toBeCloseTo(-14.29, 2);
    expect(end[1]).toBeCloseTo(35.2, 2);
    expect(end[2]).toBeCloseTo(-44.7, 2);
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
