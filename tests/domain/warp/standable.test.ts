import fc from "fast-check";
import { expect, it } from "vitest";
import {
  isStandableLanding,
  type LandingSample,
} from "../../../src/domain/warp/landing";

const stone: LandingSample = {
  typeId: "minecraft:stone",
  isAir: false,
  isLiquid: false,
  solid: true,
};
const air: LandingSample = {
  typeId: "minecraft:air",
  isAir: true,
  isLiquid: false,
  solid: false,
};
const sample = fc.record({
  typeId: fc.constantFrom(
    "minecraft:stone",
    "minecraft:air",
    "minecraft:water",
    "minecraft:short_grass",
  ),
  isAir: fc.boolean(),
  isLiquid: fc.boolean(),
  solid: fc.boolean(),
});

it("requires solid, dry, non-air support regardless of the body and head", () => {
  fc.assert(
    fc.property(sample, sample, sample, (floor, body, head) => {
      if (!floor.solid || floor.isAir || floor.isLiquid)
        expect(isStandableLanding(floor, body, head)).toBe(false);
    }),
  );
});
it("accepts exactly air or dry non-solid body and head cells above safe support", () => {
  fc.assert(
    fc.property(sample, sample, (body, head) => {
      const passable = (cell: LandingSample) =>
        cell.isAir || (!cell.isLiquid && !cell.solid);
      expect(isStandableLanding(stone, body, head)).toBe(
        passable(body) && passable(head),
      );
    }),
  );
});
it("rejects every hazard in any of the three cells regardless of its flags", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        "lava",
        "flowing_lava",
        "fire",
        "soul_fire",
        "cactus",
        "magma",
      ),
      fc.integer({ min: 0, max: 2 }),
      sample,
      (hazard, index, flags) => {
        const cells: [LandingSample, LandingSample, LandingSample] = [
          stone,
          air,
          air,
        ];
        cells[index] = { ...flags, typeId: `minecraft:${hazard}` };
        expect(isStandableLanding(cells[0], cells[1], cells[2])).toBe(false);
      },
    ),
  );
});
it("accepts a full warp block floor and passable grass but rejects a solid body", () => {
  const warp = { ...stone, typeId: "yasu_build:warp_block" };
  expect(
    isStandableLanding(
      warp,
      { ...air, typeId: "minecraft:short_grass", isAir: false },
      air,
    ),
  ).toBe(true);
  expect(isStandableLanding(warp, stone, air)).toBe(false);
});
