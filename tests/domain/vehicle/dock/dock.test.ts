import fc from "fast-check";
import { expect, it } from "vitest";
import { inBox } from "../../../../src/domain/vehicle/dock/dock";

it("includes min and excludes max on every axis", () => {
  const point = fc.record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: -1000, max: 1000 }),
    z: fc.integer({ min: -1000, max: 1000 }),
  });
  fc.assert(
    fc.property(point, fc.integer({ min: 1, max: 100 }), (min, size) => {
      const max = { x: min.x + size, y: min.y + size, z: min.z + size };
      const box = { min, max };
      expect(inBox(box, min)).toBe(true);
      for (const axis of ["x", "y", "z"] as const) {
        expect(inBox(box, { ...min, [axis]: max[axis] })).toBe(false);
        expect(inBox(box, { ...min, [axis]: min[axis] - 1 })).toBe(false);
        expect(inBox(box, { ...min, [axis]: max[axis] - 0.5 })).toBe(true);
      }
    }),
  );
});
