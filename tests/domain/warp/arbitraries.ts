import fc from "fast-check";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { asWarpPointId } from "../../../src/domain/warp/ids";
import { parseWarpName } from "../../../src/domain/warp/warpName";
import type { WarpPoint } from "../../../src/domain/warp/warpPoint";
import { addPoint, emptyRegistry } from "../../../src/domain/warp/warpRegistry";

export const cell = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -64, max: 320 }),
  z: fc.integer({ min: -1000, max: 1000 }),
});
export const point: fc.Arbitrary<WarpPoint> = fc.record({
  id: fc.uuid().map(asWarpPointId),
  name: fc
    .string({ maxLength: 100 })
    .map((s) => parseWarpName(s) ?? defaultName()),
  owner: fc.string(),
  dimension: fc
    .constantFrom("overworld", "nether", "the_end")
    .map(asDimensionId),
  cell,
});

function defaultName() {
  const name = parseWarpName("Warp");
  if (!name) throw Error("missing name");
  return name;
}

export const registry = fc.array(point, { maxLength: 100 }).map((points) =>
  points.reduce((reg, p) => {
    const result = addPoint(reg, p);
    return result.ok ? result.registry : reg;
  }, emptyRegistry()),
);
