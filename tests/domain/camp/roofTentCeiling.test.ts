import fc from "fast-check";
import { expect, it } from "vitest";
import {
  ROOF_TENT_CEILING_SHAPE,
  roofTentCeilingCells,
} from "../../../src/domain/camp/roofTent/ceiling";
import { forward } from "../../../src/domain/shared/vec";

const variants = fc.constantFrom("ladder", "ground" as const);
const origin = fc.record({
  x: fc.double({ min: -200, max: 200, noNaN: true }),
  y: fc.integer({ min: -50, max: 200 }),
  z: fc.double({ min: -200, max: 200, noNaN: true }),
});
const yaw = fc.double({ min: -360, max: 360, noNaN: true });

it("covers every column whose centre lies inside the rotated footprint, all above the ridge", () => {
  fc.assert(
    fc.property(origin, yaw, variants, (o, y, variant) => {
      const shape = ROOF_TENT_CEILING_SHAPE[variant];
      const cells = roofTentCeilingCells(o, y, variant);
      const keys = new Set(cells.map((c) => `${c.x},${c.z}`));
      const f = forward(y);
      const left = { x: f.z, z: -f.x };
      for (let i = 0; i < 20; i++) {
        const a = ((i * 0.37) % 1) * 2 - 1;
        const b = ((i * 0.61) % 1) * 2 - 1;
        const px = o.x + f.x * a * shape.along + left.x * b * shape.across;
        const pz = o.z + f.z * a * shape.along + left.z * b * shape.across;
        expect(keys.has(`${Math.floor(px)},${Math.floor(pz)}`)).toBe(true);
      }
      for (const c of cells) {
        expect(c.y).toBeGreaterThan(o.y + shape.ridge);
        expect(c.y).toBeLessThanOrEqual(o.y + shape.ridge + 1);
      }
      expect(new Set(cells.map((c) => `${c.x},${c.z}`)).size).toBe(
        cells.length,
      );
    }),
  );
});

it("stays within the footprint's rotated bounds and grows with the SUV shell", () => {
  fc.assert(
    fc.property(origin, yaw, variants, (o, y, variant) => {
      const shape = ROOF_TENT_CEILING_SHAPE[variant];
      const reach = shape.along + shape.across;
      for (const c of roofTentCeilingCells(o, y, variant)) {
        expect(Math.abs(c.x + 0.5 - o.x)).toBeLessThanOrEqual(reach + 0.5);
        expect(Math.abs(c.z + 0.5 - o.z)).toBeLessThanOrEqual(reach + 0.5);
      }
    }),
  );
  const at = { x: 0.5, y: 64, z: 0.5 };
  expect(roofTentCeilingCells(at, 0, "ladder").length).toBeGreaterThan(
    roofTentCeilingCells(at, 0, "ground").length,
  );
});
