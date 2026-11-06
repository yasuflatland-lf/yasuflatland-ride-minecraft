import fc from "fast-check";
import { expect, it } from "vitest";
import { dominantHorizontalAxis } from "../../../src/domain/build/axis";
import { ellipseCells } from "../../../src/domain/build/volume/ellipse";
import { ellipse, ellipseOn } from "../../../src/domain/build/wireframe";

const coordinate = fc.integer({ min: -100, max: 100 });
const size = fc.integer({ min: 1, max: 20 });

it("reflects ellipse cells and walls across both axes and marks exposed neighbors", () => {
  fc.assert(
    fc.property(
      coordinate,
      coordinate,
      size,
      size,
      (uMin, vMin, width, height) => {
        const uMax = uMin + width - 1;
        const vMax = vMin + height - 1;
        const cells = [...ellipseCells({ uMin, uMax, vMin, vMax })];
        const byPosition = new Map(
          cells.map(({ u, v, wall }) => [`${u},${v}`, wall]),
        );
        for (const { u, v, wall } of cells) {
          expect(byPosition.get(`${uMin + uMax - u},${v}`)).toBe(wall);
          expect(byPosition.get(`${u},${vMin + vMax - v}`)).toBe(wall);
          expect(wall).toBe(
            [
              [u - 1, v],
              [u + 1, v],
              [u, v - 1],
              [u, v + 1],
            ].some(([x, y]) => !byPosition.has(`${x},${y}`)),
          );
        }
      },
    ),
  );
});

it("matches horizontal ellipse points and lengths", () => {
  fc.assert(
    fc.property(
      coordinate,
      coordinate,
      coordinate,
      size,
      size,
      fc.double({ min: 0, max: 1, noNaN: true }),
      (x, y, z, r, s, t) => {
        const horizontal = ellipse(x, y, z, r, s);
        const plane = ellipseOn(
          { x, y, z },
          { x: r, y: 0, z: 0 },
          { x: 0, y: 0, z: s },
        );
        expect(plane.at(t)).toEqual(horizontal.at(t));
        expect(plane.length).toBe(horizontal.length);
      },
    ),
  );
});

it("uses both vectors to draw a plane ellipse", () => {
  const curve = ellipseOn(
    { x: 1, y: 2, z: 3 },
    { x: 0, y: 2, z: 0 },
    { x: 0, y: 0, z: 4 },
  );
  expect(curve.at(0)).toEqual({ x: 1, y: 4, z: 3 });
  expect(curve.at(0.25).z).toBe(7);
  expect(curve.closed).toBe(true);
});

it("chooses the dominant horizontal axis with x winning ties", () => {
  fc.assert(
    fc.property(coordinate, coordinate, coordinate, (x, y, z) => {
      expect(dominantHorizontalAxis({ x, y, z })).toBe(
        Math.abs(x) >= Math.abs(z) ? "x" : "z",
      );
    }),
  );
});
