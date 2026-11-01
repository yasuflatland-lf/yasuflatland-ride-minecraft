import fc from "fast-check";
import { expect, it } from "vitest";
import { boxOf } from "../../../src/domain/build/box";
import { cubeGeometry } from "../../../src/domain/build/volume/cube";
import { volumeSize } from "../../../src/domain/build/volume/size";

it("reports positive dimensions whose product counts every filled cuboid cell", () => {
  const coordinate = fc.integer({ min: -10, max: 10 });
  const corner = fc.record({ x: coordinate, y: coordinate, z: coordinate });
  fc.assert(
    fc.property(
      corner,
      corner,
      fc.integer({ min: 1, max: 20 }),
      (a, b, height) => {
        const base = boxOf(a, { ...b, y: a.y });
        const size = volumeSize(base, height);
        expect(size.x).toBeGreaterThanOrEqual(1);
        expect(size.y).toBeGreaterThanOrEqual(1);
        expect(size.z).toBeGreaterThanOrEqual(1);
        expect(size.x * size.y * size.z).toBe(
          [...cubeGeometry.cells({ base, height, kind: "cube" }, "fill")]
            .length,
        );
      },
    ),
  );
});
