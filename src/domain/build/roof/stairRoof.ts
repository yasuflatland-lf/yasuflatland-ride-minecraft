import type { Pattern } from "../edit/pattern";
import { type StairMaterial, stairDescending, stairFlatTop } from "../stair";
import { type RoofSpec, roofSlopeAt } from "./roof";

export function stairRoofPattern(
  spec: RoofSpec,
  stair: StairMaterial,
): Pattern {
  return {
    stateAt(cell) {
      const slope = roofSlopeAt(spec, cell);
      return slope.kind === "slope"
        ? stairDescending(stair, slope.descends)
        : stairFlatTop(stair);
    },
  };
}
