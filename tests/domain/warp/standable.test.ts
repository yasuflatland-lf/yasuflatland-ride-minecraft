import fc from "fast-check";
import { expect, it } from "vitest";
import {
  isStandable,
  type StandSample,
} from "../../../src/domain/shared/standing";
import { WARP_LANDING_POLICY } from "../../../src/domain/warp/landing";

const stone: StandSample = {
  typeId: "minecraft:stone",
  isAir: false,
  isLiquid: false,
  solidTop: true,
};
const air: StandSample = {
  typeId: "minecraft:air",
  isAir: true,
  isLiquid: false,
  solidTop: false,
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
  solidTop: fc.boolean(),
});

it("preserves warp standability for non-hazardous blocks", () => {
  fc.assert(
    fc.property(sample, sample, sample, (floor, body, head) => {
      const passable = (cell: StandSample) =>
        cell.isAir || (!cell.isLiquid && !cell.solidTop);
      expect(isStandable(body, head, floor, WARP_LANDING_POLICY)).toBe(
        floor.solidTop &&
          !floor.isAir &&
          !floor.isLiquid &&
          passable(body) &&
          passable(head),
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
        const cells: [StandSample, StandSample, StandSample] = [
          air,
          air,
          stone,
        ];
        cells[index] = { ...flags, typeId: `minecraft:${hazard}` };
        expect(isStandable(...cells, WARP_LANDING_POLICY)).toBe(false);
      },
    ),
  );
});
it("accepts a full warp block floor and passable grass but rejects a solid body", () => {
  const warp = { ...stone, typeId: "yasu_build:warp_block" };
  expect(
    isStandable(
      { ...air, typeId: "minecraft:short_grass", isAir: false },
      air,
      warp,
      WARP_LANDING_POLICY,
    ),
  ).toBe(true);
  expect(isStandable(stone, air, warp, WARP_LANDING_POLICY)).toBe(false);
});
