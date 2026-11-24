import fc from "fast-check";
import { expect, it } from "vitest";
import { virtualEndPoint } from "../../../src/domain/build/aim/aim";
import {
  aimedEndPoint,
  endPointReach,
  virtualAimedEndPoint,
} from "../../../src/domain/build/aim/endPoint";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { OVERWORLD_RANGE } from "../../helpers/buildHeightRange";

const point1 = cellOf({ x: 4, y: 60, z: 2 });
const aim = {
  ray: {
    origin: { x: 0.5, y: 62.5, z: 3.5 },
    direction: { x: 1, y: 0, z: 0 },
  },
  input: "pointer",
} as const;
const block = { cell: cellOf({ x: 3, y: 62, z: 3 }), face: "west" } as const;

it("keeps touch tap reach below pointer reach", () => {
  expect(endPointReach("touch")).toBe(BUILD_SPEC.touchTapReach);
  expect(BUILD_SPEC.touchTapReach).toBeLessThan(BUILD_SPEC.reach);
  expect(endPointReach("pointer")).toBe(BUILD_SPEC.reach);
});

const planeDistance = fc.integer({ min: 0, max: BUILD_SPEC.reach + 1 });
const slope = fc.integer({ min: -2, max: 2 });

it("returns a touch virtual point only within tap reach along the ray", () => {
  fc.assert(
    fc.property(planeDistance, slope, (distance, rise) => {
      const plane = cellOf({ ...point1, x: distance });
      const ray = { ...aim.ray, direction: { x: 1, y: rise, z: 0 } };
      const result = aimedEndPoint(
        plane,
        { input: "touch", ray },
        OVERWORLD_RANGE,
      );
      expect(result !== undefined).toBe(
        distance * Math.hypot(1, rise) <= BUILD_SPEC.touchTapReach,
      );
    }),
  );
});

it("uses the full virtual end point reach for pointer rays", () => {
  fc.assert(
    fc.property(
      planeDistance,
      slope,
      fc.boolean(),
      (distance, rise, hasBlock) => {
        const plane = cellOf({ ...point1, x: distance });
        const ray = { ...aim.ray, direction: { x: 1, y: rise, z: 0 } };
        const sample = {
          input: "pointer" as const,
          ray,
          ...(hasBlock ? { block } : {}),
        };
        const expected = virtualEndPoint(
          plane,
          ray,
          BUILD_SPEC.reach,
          OVERWORLD_RANGE,
        );
        expect(virtualAimedEndPoint(plane, sample, OVERWORLD_RANGE)).toEqual(
          expected,
        );
        if (!hasBlock)
          expect(aimedEndPoint(plane, sample, OVERWORLD_RANGE)).toEqual(
            expected,
          );
      },
    ),
  );
});

it("prefers block hits throughout build reach for both input kinds", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: BUILD_SPEC.reach }), (distance) => {
      const hit = { ...block, cell: cellOf({ ...block.cell, x: distance }) };
      for (const input of ["touch", "pointer"] as const) {
        expect(
          aimedEndPoint(point1, { ...aim, input, block: hit }, OVERWORLD_RANGE),
        ).toEqual(hit.cell);
      }
    }),
  );
});
