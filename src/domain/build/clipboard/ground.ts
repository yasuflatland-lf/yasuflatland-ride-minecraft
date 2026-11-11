import { boxFromSize, type CellBox, sizeOf } from "../box";
import { BUILD_SPEC } from "../spec";

// Wide footprints get a shallower scan so one snap never reads more than
// BUILD_SPEC.groundProbeBudget cells; every column still reads at least one.
export function groundScanDepth(box: CellBox): number {
  const { x, z } = sizeOf(box);
  return Math.max(
    1,
    Math.min(
      BUILD_SPEC.groundSearchDepth,
      Math.floor(BUILD_SPEC.groundProbeBudget / (x * z)),
    ),
  );
}

// topOf returns the top ground cell of a column between lowestY and box.min.y
// inclusive. Once some column has ground, later columns only need to look
// above it, so flat or rising ground costs about one read per column.
export function snapToGround(
  box: CellBox,
  topOf: (x: number, z: number, lowestY: number) => number | undefined,
): CellBox | undefined {
  const deepest = box.min.y - groundScanDepth(box) + 1;
  let highest: number | undefined;
  for (let z = box.min.z; z <= box.max.z && highest !== box.min.y; z++) {
    for (let x = box.min.x; x <= box.max.x && highest !== box.min.y; x++) {
      const lowest = highest === undefined ? deepest : highest + 1;
      const top = topOf(x, z, lowest);
      if (top !== undefined && top >= lowest && top <= box.min.y) highest = top;
    }
  }
  return highest === undefined
    ? undefined
    : boxFromSize({ ...box.min, y: highest + 1 }, sizeOf(box));
}
