import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { readBlockGroups } from "../../../../../src/domain/vehicle/kinds/camper/blockGroups";

it("reads all groups in key order in one batch and returns the corresponding slices", () => {
  const coordinate = fc.integer({ min: -64, max: 64 });
  const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
  fc.assert(
    fc.property(
      fc.dictionary(fc.string(), fc.array(cell)),
      fc.array(fc.option(fc.string(), { nil: undefined })),
      (groups, generatedTypes) => {
        const cells = Object.values(groups).flat();
        const types = cells.map((_, index) => generatedTypes[index]);
        const blockTypes = vi.fn((_cells: readonly Vec3[]) => types);

        const result = readBlockGroups({ blockTypes }, groups);

        expect(blockTypes.mock.calls).toEqual([[cells]]);
        expect(Object.keys(result)).toEqual(Object.keys(groups));
        let start = 0;
        for (const [name, group] of Object.entries(groups)) {
          const end = start + group.length;
          expect(result[name]).toEqual(types.slice(start, end));
          start = end;
        }
      },
    ),
  );
});
