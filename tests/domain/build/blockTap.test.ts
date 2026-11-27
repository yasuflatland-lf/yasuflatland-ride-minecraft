import fc from "fast-check";
import { expect, it } from "vitest";
import { blockTapOf } from "../../../src/domain/build/blockTap";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { cell as cellArb } from "../warp/arbitraries";

it("freezes the tapped dimension and cell and includes only a supplied face", () => {
  fc.assert(
    fc.property(
      fc.string().map(asDimensionId),
      cellArb,
      (dimensionId, cell) => {
        const tap = blockTapOf(dimensionId, cell);
        expect(Object.isFrozen(tap)).toBe(true);
        expect(tap).toStrictEqual({ dimensionId, cell });
        for (const face of ["up", "down", ...FACINGS] as const) {
          const facedTap = blockTapOf(dimensionId, cell, face);
          expect(Object.isFrozen(facedTap)).toBe(true);
          expect(facedTap).toStrictEqual({ dimensionId, cell, face });
        }
      },
    ),
  );
});
