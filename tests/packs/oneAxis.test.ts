import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertOneAxis, multipleAxes } from "./oneAxis";

const nonzero = fc.integer({ min: 1, max: 179 });
describe("compound rotation assemblies", () => {
  it("requires membership by cube value for any pair of nonzero axes", () => {
    fc.assert(
      fc.property(
        nonzero,
        nonzero,
        fc.integer({ min: 0, max: 2 }),
        (a, b, zero) => {
          const rotation = [a, b];
          rotation.splice(zero, 0, 0);
          const cube = { rotation, origin: [1, 2, 3] };
          expect(multipleAxes(cube)).toBe(true);
          expect(() => assertOneAxis([cube], {})).toThrow();
          expect(() =>
            assertOneAxis([cube], {
              assembly: [{ ...cube, origin: [4, 5, 6] }],
            }),
          ).toThrow();
          expect(() =>
            assertOneAxis([cube], { assembly: structuredClone([cube]) }),
          ).not.toThrow();
        },
      ),
    );
  });

  it("allows unregistered cubes with at most one axis beyond the tolerance", () => {
    fc.assert(
      fc.property(fc.integer({ min: -180, max: 180 }), (angle) => {
        expect(() =>
          assertOneAxis([{}, { rotation: [angle, 1e-6, -1e-6] }], {}),
        ).not.toThrow();
      }),
    );
  });
});
