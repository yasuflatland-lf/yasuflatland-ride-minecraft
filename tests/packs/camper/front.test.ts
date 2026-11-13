import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../../support/pythonWorker";
import {
  baseOrigin,
  bone,
  type Cube,
  end,
  loadAtlas,
  swatchUv,
} from "./helpers";

const python = startPythonWorker();
afterAll(() => python.close());
const { regions, slots } = await loadAtlas(python);

describe("camper front panels (ADR 0226)", () => {
  const LEAN = (Math.atan(0.15) * 180) / Math.PI;
  const YAW = 8;
  const YAW_TAN = Math.tan((YAW * Math.PI) / 180);
  const BOTTOM = 8;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  // The game's rotation order is Rz(-rz) * Ry(ry) * Rx(-rx) (ADR 0166).
  const turned = (cube: Cube, [x, y, z]: readonly [number, number, number]) => {
    const [rx = 0, ry = 0, rz = 0] = cube.rotation ?? [];
    const y1 = y * Math.cos(rad(-rx)) - z * Math.sin(rad(-rx));
    const z1 = y * Math.sin(rad(-rx)) + z * Math.cos(rad(-rx));
    const x2 = x * Math.cos(rad(ry)) + z1 * Math.sin(rad(ry));
    const z2 = -x * Math.sin(rad(ry)) + z1 * Math.cos(rad(ry));
    return [
      x2 * Math.cos(rad(-rz)) - y1 * Math.sin(rad(-rz)),
      x2 * Math.sin(rad(-rz)) + y1 * Math.cos(rad(-rz)),
      z2,
    ] as const;
  };
  const corners = (cube: Cube) => {
    const [px = 0, py = 0, pz = 0] = cube.pivot ?? [];
    return [0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
      const [x, y, z] = turned(cube, [
        (cube.origin[0] ?? 0) + (n & 1 ? (cube.size[0] ?? 0) : 0) - px,
        (cube.origin[1] ?? 0) + (n & 2 ? (cube.size[1] ?? 0) : 0) - py,
        (cube.origin[2] ?? 0) + (n & 4 ? (cube.size[2] ?? 0) : 0) - pz,
      ]);
      return [px + x, py + y, pz + z] as const;
    });
  };
  const near = (a: number, b: number, tolerance = 0.01) =>
    Math.abs(a - b) <= tolerance;
  const faceCubes = (bone("body").cubes ?? []).filter(
    (cube) =>
      near(cube.rotation?.[0] ?? 0, LEAN) &&
      near(Math.abs(cube.rotation?.[1] ?? 0), YAW) &&
      near(cube.rotation?.[2] ?? 0, 0),
  );
  const sideOf = (cube: Cube) =>
    Math.sign((cube.origin[0] ?? 0) + (cube.size[0] ?? 0) / 2);

  it("leans both panels at one slope and folds them like the windshield, nose forward", () => {
    expect(faceCubes.length).toBeGreaterThan(100);
    fc.assert(
      fc.property(fc.constantFrom(...faceCubes), (cube) => {
        // Both rows of a panel turn the outer end back: the plan view is an obtuse isosceles triangle.
        const side = sideOf(cube);
        const [ux = 0, uy = 0, uz = 0] = turned(cube, [side, 0, 0]);
        expect(ux * side).toBeGreaterThan(0.99);
        expect(uy).toBeCloseTo(0, 6);
        expect(uz).toBeCloseTo(Math.sin(rad(YAW)), 3);
        const [, vy = 0, vz = 0] = turned(cube, [0, 1, 0]);
        expect(vz / vy).toBeCloseTo(-0.15 / Math.cos(rad(YAW)), 2);
      }),
    );
  });

  it("keeps every face cube on one plane per side, from the bumper to the sill", () => {
    // The outer edge reaches z = -54.5 at the bumper and moves forward 0.15 per px of height.
    const planeZ = (x: number, y: number) =>
      -54.5 - 0.15 * (y - BOTTOM) + (Math.abs(x) - 24) * YAW_TAN;
    fc.assert(
      fc.property(fc.constantFrom(...faceCubes), (cube) => {
        for (const [x, y, z] of corners(cube)) {
          const depth = z - planeZ(x, y);
          // The lamp bezels are the proudest cubes, 0.8 px in front of the plane.
          expect(depth).toBeGreaterThan(-0.85);
          expect(depth).toBeLessThan(1.1);
          expect(Math.abs(x)).toBeLessThan(24.2);
        }
      }),
    );
    const ys = faceCubes.flatMap((cube) => corners(cube).map(([, y]) => y));
    expect(Math.min(...ys)).toBeCloseTo(BOTTOM, 0);
    expect(Math.max(...ys)).toBeGreaterThan(33.9);
    expect(Math.max(...ys)).toBeLessThan(34.3);
  });

  it("drops the sill from the windshield base to the panels' top edge", () => {
    const strips = (bone("body").cubes ?? []).filter(
      (cube) =>
        (cube.rotation?.[0] ?? 0) > 15 &&
        cube.size[0] === 0.5 &&
        cube.size[1] === 0.25,
    );
    expect(strips).toHaveLength(96);
    for (const cube of strips) {
      const ys = corners(cube).map(([, y]) => y);
      expect(Math.min(...ys)).toBeLessThan(34.1);
      expect(Math.max(...ys)).toBeGreaterThan(35.6);
      expect(Math.max(...ys)).toBeLessThan(36);
    }
  });

  it("stands the windshield panes upright, parallel to the panels' top edge", () => {
    const panes = bone("glass").cubes?.filter(
      (cube) => Math.abs(cube.rotation?.[1] ?? 0) === YAW,
    );
    expect(panes).toHaveLength(2);
    for (const cube of panes ?? []) {
      expect(cube.rotation?.[0]).toBe(0);
      expect(cube.rotation?.[2]).toBe(0);
      const points = corners(cube);
      const inner = points.reduce((a, b) =>
        Math.abs(a[0] ?? 0) < Math.abs(b[0] ?? 0) ? a : b,
      );
      const outer = points.reduce((a, b) =>
        Math.abs(a[0] ?? 0) > Math.abs(b[0] ?? 0) ? a : b,
      );
      expect(inner[2] ?? 0).toBeLessThan((outer[2] ?? 0) - 2.5);
    }
  });

  it("runs the cab-over's upper panel flat down to a V on the centre line", () => {
    const body = bone("body").cubes ?? [];
    const zAt = (cube: Cube) =>
      Math.min(...corners(cube).map(([, , z]) => z ?? 0));
    const skin = body.filter(
      (cube) =>
        cube.size[1] === 0.25 &&
        (cube.origin[1] ?? 0) >= 49.5 &&
        (cube.origin[1] ?? 0) < 64 &&
        (cube.origin[2] ?? 0) < -50 &&
        !cube.rotation?.[0],
    );
    const point = skin.reduce((a, b) => (zAt(a) < zAt(b) ? a : b));
    expect(point.origin[1]).toBeGreaterThanOrEqual(51.5);
    expect(point.origin[1]).toBeLessThan(52.5);
    expect(zAt(point)).toBeCloseTo(-62, 0);
    const upper = skin.filter(
      (cube) => cube.size[0] === 48 && (cube.origin[1] ?? 0) >= 56,
    );
    expect(upper.length).toBeGreaterThan(20);
    for (const cube of upper) {
      const y = (cube.origin[1] ?? 0) + 0.125;
      expect(cube.origin[2]).toBeCloseTo(-53 - 0.75 * (64 - y), 2);
    }
  });

  it("replaces the plain square behind the door with the water fill, placard, and lamp", () => {
    const body = bone("body").cubes ?? [];
    const parts = body.filter(
      (cube) =>
        (cube.origin[0] ?? 0) < -24 &&
        (cube.origin[2] ?? 0) >= 11.5 &&
        end(cube, 2) <= 16.5 &&
        (cube.origin[1] ?? 0) >= 10 &&
        end(cube, 1) <= 26,
    );
    const colour = (cube: Cube) =>
      slots[(cube.uv.north?.uv[0] ?? -1) - baseOrigin[0]];
    expect(new Set(parts.map(colour))).toEqual(
      new Set(["panel", "grille", "slat", "chrome"]),
    );
    const frame = parts.filter(
      (cube) => colour(cube) === "panel" && !cube.rotation,
    );
    const frameY = frame.flatMap((cube) => [cube.origin[1] ?? 0, end(cube, 1)]);
    // The frame straddles the skirt's top edge at y = 15, as on the photo.
    expect(Math.min(...frameY)).toBeLessThan(15);
    expect(Math.max(...frameY)).toBeGreaterThan(15);
    const ring = parts.filter((cube) => cube.rotation);
    // A 24-bar ring, the round lamp's two 16-bar discs, and the filler cap disc.
    expect(ring).toHaveLength(24 + 3 * 16);
    expect(
      body.some(
        (cube) =>
          cube.origin[1] === 13 &&
          cube.size[1] === 6 &&
          cube.origin[2] === 10 &&
          cube.size[2] === 7,
      ),
    ).toBe(false);
  });

  it("frames the entry door in riveted aluminium with three hinges and a latch plate", () => {
    const body = bone("body").cubes ?? [];
    const colour = (cube: Cube) =>
      slots[(cube.uv.north?.uv[0] ?? -1) - baseOrigin[0]];
    const trim = body.filter(
      (cube) =>
        end(cube, 0) <= -24 &&
        (cube.origin[0] ?? 0) < -24.1 &&
        (cube.origin[2] ?? 0) >= -9.2 &&
        end(cube, 2) <= 8.2 &&
        (cube.origin[1] ?? 0) >= 8.5 &&
        end(cube, 1) <= 57,
    );
    const jambs = trim.filter(
      (cube) => colour(cube) === "aluminium" && (cube.size[1] ?? 0) > 40,
    );
    expect(jambs).toHaveLength(3);
    const knuckles = trim.filter(
      (cube) => colour(cube) === "grille" && cube.size[1] === 0.5,
    );
    expect(knuckles).toHaveLength(6);
    const rivets = trim.filter(
      (cube) => colour(cube) === "slat" && cube.size[1] === 0.18,
    );
    expect(rivets).toHaveLength(18);
    const plate = (bone("door_entry").cubes ?? []).filter(
      (cube) =>
        colour(cube) === "aluminium" &&
        cube.size[1] === 2.7 &&
        cube.origin[2] === 4.5,
    );
    expect(plate).toHaveLength(1);
  });

  it("builds the fold-out step from thin panels, open at the back", () => {
    const body = bone("body").cubes ?? [];
    const step = body.filter(
      (cube) =>
        end(cube, 0) <= -24 &&
        (cube.origin[0] ?? 0) < -24.5 &&
        (cube.origin[1] ?? 0) >= 3.5 &&
        end(cube, 1) <= 8 &&
        (cube.origin[2] ?? 0) >= -6.5 &&
        end(cube, 2) <= 7.5,
    );
    expect(step.length).toBeGreaterThan(20);
    for (const cube of step) {
      const thinnest = Math.min(
        cube.size[0] ?? 0,
        cube.size[1] ?? 0,
        cube.size[2] ?? 0,
      );
      expect(thinnest).toBeLessThanOrEqual(0.5);
    }
    // No plate closes the space between the tread and the body at the wall.
    const backPlate = step.filter(
      (cube) => (cube.size[1] ?? 0) > 2 && (cube.size[2] ?? 0) > 2,
    );
    expect(backPlate).toHaveLength(0);
  });

  it("builds the rear storage hatches with a rounded rail, five louver columns, and latch knobs", () => {
    const body = bone("body").cubes ?? [];
    const colour = (cube: Cube) =>
      slots[(cube.uv.north?.uv[0] ?? -1) - baseOrigin[0]];
    // The hatch is on the right side only; the left rear wall stays plain.
    for (const outer of [-1]) {
      const hatch = body.filter((cube) => {
        const x = outer < 0 ? (cube.origin[0] ?? 0) : end(cube, 0);
        return (
          x * outer >= 24 &&
          (cube.origin[2] ?? 0) >= 42 &&
          end(cube, 2) <= 56 &&
          (cube.origin[1] ?? 0) >= 8 &&
          end(cube, 1) <= 28
        );
      });
      const louvers = hatch.filter(
        (cube) => colour(cube) === "panel" && cube.size[1] === 0.3,
      );
      expect(louvers).toHaveLength(22);
      const dividers = hatch.filter(
        (cube) => colour(cube) === "panel" && cube.size[2] === 0.25,
      );
      expect(dividers).toHaveLength(4);
      const knobs = hatch.filter(
        (cube) => colour(cube) === "slat" && cube.size[1] === 0.8,
      );
      expect(knobs).toHaveLength(3);
      const rail = hatch.filter((cube) => colour(cube) === "aluminium");
      const widths = rail.map((cube) => cube.size[2] ?? 0);
      expect(Math.min(...widths)).toBeLessThan(Math.max(...widths));
    }
  });

  it("leaves the left rear wall without a hatch and puts every mirror part in the PBR mirror bone", () => {
    const body = bone("body").cubes ?? [];
    expect(
      body.filter(
        (c) =>
          slots[(c.uv.north?.uv[0] ?? -1) - baseOrigin[0]] === "aluminium" &&
          end(c, 0) >= 24 &&
          (c.origin[2] ?? 0) >= 42 &&
          end(c, 2) <= 56 &&
          (c.origin[1] ?? 0) >= 8 &&
          end(c, 1) <= 28,
      ),
    ).toEqual([]);
    const mirror = bone("mirror");
    expect(mirror.parent).toBe("body");
    expect(mirror.cubes).toHaveLength(2 * 6);
    expect(regions.some(([name]) => name === "mirror_chrome")).toBe(true);
  });

  it("paints the wall below the entry door like the skirt beside it", () => {
    const body = bone("body").cubes ?? [];
    const tan = swatchUv("tan")[0];
    const outermostAt = (y: number, z: number) =>
      body
        .filter(
          (cube) =>
            !cube.rotation &&
            (cube.origin[1] ?? 0) <= y &&
            end(cube, 1) >= y &&
            (cube.origin[2] ?? 0) <= z &&
            end(cube, 2) >= z &&
            (cube.origin[0] ?? 0) < -23,
        )
        .reduce((a, b) => ((a.origin[0] ?? 0) < (b.origin[0] ?? 0) ? a : b));
    for (const z of [-6, 0, 6]) {
      // y = 11.3 is above the door threshold plate.
      expect(outermostAt(11.3, z).uv.north?.uv[0], `z=${z}`).toBe(tan);
    }
  });

  it("starts every grille row exactly on the nose so the panels leave no gap", () => {
    const rows = faceCubes.filter(
      (cube) =>
        slots[(cube.uv.north?.uv[0] ?? -1) - baseOrigin[0]] === "slat" &&
        Math.abs(
          (cube.origin[0] ?? 0) +
            (sideOf(cube) > 0 ? 0 : (cube.size[0] ?? 0)) -
            (cube.pivot?.[0] ?? 0),
        ) < 1e-6,
    );
    expect(rows.length).toBeGreaterThan(20);
    for (const cube of rows) {
      const inner = Math.min(...corners(cube).map(([x]) => Math.abs(x ?? 0)));
      expect(inner).toBeLessThan(0.05);
    }
  });

  it("mirrors the left panel onto the right one", () => {
    const centre = (cube: Cube) => {
      const points = corners(cube);
      return [0, 1, 2].map(
        (axis) =>
          points.reduce((sum, point) => sum + (point[axis] ?? 0), 0) / 8,
      );
    };
    const right = faceCubes.filter((cube) => sideOf(cube) > 0).map(centre);
    const left = faceCubes.filter((cube) => sideOf(cube) < 0).map(centre);
    expect(left).toHaveLength(right.length);
    for (const [x = 0, y = 0, z = 0] of left) {
      expect(
        right.some(
          ([rx = 0, ry = 0, rz = 0]) =>
            near(rx, -x) && near(ry, y) && near(rz, z),
        ),
        `mirror of ${x},${y},${z}`,
      ).toBe(true);
    }
  });
});
