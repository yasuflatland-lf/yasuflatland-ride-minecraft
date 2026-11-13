import { describe, expect, it } from "vitest";
import { bone, type Cube, extent, near } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
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

  it("lays the dash-top air vent wholly on the dash pad (#414)", () => {
    const body = bone("body").cubes ?? [];
    // The pad runs from 33.4 to 35, just under the windshield's lower frame at 36 (#422).
    const pads = body.filter(
      (cube) =>
        near(cube.origin[1], 33.4) && near(cube.size[1], 1.6) && !cube.rotation,
    );
    expect(pads).toHaveLength(1);
    const pad = pads[0] as Cube;
    const [padX0, padX1] = extent(pad, 0);
    const [, padTop] = extent(pad, 1);
    expect(padTop).toBeLessThan(36);
    const [padZ0, padZ1] = extent(pad, 2);
    const vent = body.filter((cube) => {
      const [x0, x1] = extent(cube, 0);
      return near(cube.origin[1], padTop) && x0 > -15 && x1 < -9;
    });
    expect(vent.length).toBeGreaterThanOrEqual(3);
    for (const cube of vent) {
      // A cube turned about y reaches at most half its x-z diagonal from its middle.
      const reach = cube.rotation
        ? Math.hypot(cube.size[0] ?? 0, cube.size[2] ?? 0) / 2
        : (cube.size[2] ?? 0) / 2;
      const [z0, z1] = extent(cube, 2);
      const [x0, x1] = extent(cube, 0);
      expect(x0).toBeGreaterThanOrEqual(padX0);
      expect(x1).toBeLessThanOrEqual(padX1);
      expect((z0 + z1) / 2 - reach).toBeGreaterThanOrEqual(padZ0);
      expect((z0 + z1) / 2 + reach).toBeLessThanOrEqual(padZ1);
    }
  });

  it("keeps the console switches clear of the steering column and the door armrest (#414)", () => {
    const body = bone("body").cubes ?? [];
    const armrests = body.filter(
      (cube) =>
        near(cube.origin[1], 22) &&
        near(cube.size[1], 1.4) &&
        near(cube.size[2], 8) &&
        (cube.origin[0] ?? 0) < 0,
    );
    expect(armrests).toHaveLength(1);
    const armrest = armrests[0] as Cube;
    const steering = bone("steering");
    const column = (steering.cubes ?? []).find((cube) =>
      near(cube.size[2], 15.4),
    );
    expect(column).toBeDefined();
    const lean = ((steering.rotation?.[0] ?? 0) * Math.PI) / 180;
    // Undo the wheel bone's lean about x to test a point against the column cube.
    const inColumn = ([x, y, z]: number[]) => {
      const [, py, pz] = steering.pivot as [number, number, number];
      const dy = (y ?? 0) - py;
      const dz = (z ?? 0) - pz;
      const local = [
        x ?? 0,
        py + dy * Math.cos(lean) - dz * Math.sin(lean),
        pz + dy * Math.sin(lean) + dz * Math.cos(lean),
      ];
      return local.every((v, axis) => {
        const [lo, hi] = extent(column as Cube, axis);
        return v > lo && v < hi;
      });
    };
    const overlaps = (a: Cube, b: Cube) =>
      [0, 1, 2].every((axis) => {
        const [a0, a1] = extent(a, axis);
        const [b0, b1] = extent(b, axis);
        return a0 < b1 && b0 < a1;
      });
    // The switches, lamps, and levers stand on the black panel's face, 0.2 to 0.6 px off the dash.
    const switches = body.filter((cube) => {
      const [x0, x1] = extent(cube, 0);
      const [z0, z1] = extent(cube, 2);
      return (
        x0 > -22.5 &&
        x1 < -9 &&
        z0 > -47.62 &&
        z1 < -47.2 &&
        Math.max(cube.size[0] ?? 0, cube.size[1] ?? 0) < 2.5
      );
    });
    expect(switches.length).toBeGreaterThan(20);
    for (const cube of switches) {
      expect(overlaps(cube, armrest), JSON.stringify(cube.origin)).toBe(false);
      const [x0, x1] = extent(cube, 0);
      const [y0, y1] = extent(cube, 1);
      const [z0, z1] = extent(cube, 2);
      for (let i = 0; i <= 6; i++)
        for (let j = 0; j <= 6; j++)
          for (let k = 0; k <= 2; k++) {
            const point = [
              x0 + ((x1 - x0) * i) / 6,
              y0 + ((y1 - y0) * j) / 6,
              z0 + ((z1 - z0) * k) / 2,
            ];
            expect(inColumn(point), JSON.stringify(cube.origin)).toBe(false);
          }
    }
  });

  it("ends the steering column inside the raised dash body, below the console (#422)", () => {
    const body = bone("body").cubes ?? [];
    const dashBodies = body.filter(
      (cube) =>
        near(cube.origin[1], 16) &&
        near(cube.size[0], 46) &&
        near(cube.size[2], 7),
    );
    expect(dashBodies).toHaveLength(1);
    const dash = dashBodies[0] as Cube;
    const steering = bone("steering");
    const column = (steering.cubes ?? []).find((cube) =>
      near(cube.size[2], 15.4),
    ) as Cube;
    expect(column).toBeDefined();
    const lean = ((steering.rotation?.[0] ?? 0) * Math.PI) / 180;
    const [, py, pz] = steering.pivot as [number, number, number];
    // The corners of the column's far end, in the wheel's own plane, turned by the bone's lean.
    const [cx0, cx1] = extent(column, 0);
    const [cy0, cy1] = extent(column, 1);
    const [cz0] = extent(column, 2);
    const corners = [cx0, cx1].flatMap((x) =>
      [cy0, cy1].map((y) => {
        const ly = y - py;
        const lz = cz0 - pz;
        return [
          x,
          py + ly * Math.cos(lean) + lz * Math.sin(lean),
          pz - ly * Math.sin(lean) + lz * Math.cos(lean),
        ];
      }),
    );
    const inDash = corners.filter((corner) =>
      corner.every((v, axis) => {
        const [lo, hi] = extent(dash, axis);
        return v > lo && v < hi;
      }),
    );
    expect(inDash.length).toBeGreaterThan(0);
    const consoles = body.filter(
      (cube) =>
        near(cube.size[0], 17.9) && near(cube.size[1], 8) && !cube.rotation,
    );
    expect(consoles).toHaveLength(1);
    const [consoleBottom] = extent(consoles[0] as Cube, 1);
    for (const corner of corners)
      expect(corner[1] ?? 0).toBeLessThan(consoleBottom);
  });
});
