import fc from "fast-check";
import { expect, it } from "vitest";
import { beachChairItemCells } from "../../../src/domain/resort/beachChairTop";
import type { Facing4 } from "../../../src/domain/shared/facing";

it("covers exactly the cells with positive footprint area at every quarter turn", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      fc.constantFrom<Facing4>(0, 90, 180, 270),
      fc.integer({ min: -12, max: 12 }),
      (x, z, yaw, localZ) => {
        const origin = { x: x + 0.5, y: 64, z };
        const cells = beachChairItemCells(
          origin,
          yaw,
          { x: 0, z: localZ },
          { halfX: 2, halfZ: 4 },
        );
        const sin = Math.round(Math.sin((yaw * Math.PI) / 180));
        const cos = Math.round(Math.cos((yaw * Math.PI) / 180));
        const expected = [];
        for (let cx = x - 2; cx <= x + 2; cx++)
          for (let cz = z - 2; cz <= z + 2; cz++) {
            const dx = cx + 0.5 - origin.x;
            const dz = cz + 0.5 - origin.z;
            const lx = (dx * cos + dz * sin) * 16;
            const lz = (-dx * sin + dz * cos) * 16;
            if (Math.abs(lx) < 2 + 8 && Math.abs(lz - localZ) < 4 + 8)
              expected.push({ x: cx, y: 65, z: cz });
          }
        expect(cells).toEqual(expected);
      },
    ),
  );
});
