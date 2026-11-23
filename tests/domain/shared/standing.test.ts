import fc from "fast-check";
import { expect, it } from "vitest";
import { CLEARABLE_DECORATIONS } from "../../../src/domain/shared/decorations";
import {
  isStandable,
  type StandPolicy,
  type StandSample,
} from "../../../src/domain/shared/standing";

const air: StandSample = {
  typeId: "minecraft:air",
  isAir: true,
  isLiquid: false,
  solidTop: false,
};
const stone: StandSample = {
  typeId: "minecraft:stone",
  isAir: false,
  isLiquid: false,
  solidTop: true,
};
const policy: StandPolicy = {
  allowPassableBody: true,
  hazards: new Set(),
  rejectDecorationFloor: false,
  requireSolidFloor: false,
};

it("always requires a dry, non-air floor and applies the support policy", () => {
  fc.assert(
    fc.property(
      fc.record({
        isAir: fc.boolean(),
        isLiquid: fc.boolean(),
        solidTop: fc.boolean(),
      }),
      fc.boolean(),
      (flags, requireSolidFloor) => {
        expect(
          isStandable(
            air,
            air,
            { ...stone, ...flags },
            {
              ...policy,
              requireSolidFloor,
            },
          ),
        ).toBe(
          !flags.isAir &&
            !flags.isLiquid &&
            (!requireSolidFloor || flags.solidTop),
        );
      },
    ),
  );
});

it("applies the body policy to both feet and head", () => {
  fc.assert(
    fc.property(
      fc.record({
        isAir: fc.boolean(),
        isLiquid: fc.boolean(),
        solidTop: fc.boolean(),
      }),
      fc.boolean(),
      (flags, allowPassableBody) => {
        const body = { ...air, ...flags };
        const bodyPolicy = { ...policy, allowPassableBody };
        const clear =
          flags.isAir ||
          (allowPassableBody && !flags.isLiquid && !flags.solidTop);
        expect(isStandable(body, air, stone, bodyPolicy)).toBe(clear);
        expect(isStandable(air, body, stone, bodyPolicy)).toBe(clear);
      },
    ),
  );
});

it("can reject clearable decorations specifically as floors", () => {
  fc.assert(
    fc.property(fc.constantFrom(...CLEARABLE_DECORATIONS), (typeId) => {
      const decoration = { ...air, typeId, isAir: false };
      const rejectDecorationFloor = { ...policy, rejectDecorationFloor: true };
      expect(isStandable(air, air, decoration, policy)).toBe(true);
      expect(isStandable(air, air, decoration, rejectDecorationFloor)).toBe(
        false,
      );
      expect(
        isStandable(decoration, decoration, stone, rejectDecorationFloor),
      ).toBe(true);
    }),
  );
});

it("rejects a missing sample in any standing cell", () => {
  expect(isStandable(undefined, air, stone, policy)).toBe(false);
  expect(isStandable(air, undefined, stone, policy)).toBe(false);
  expect(isStandable(air, air, undefined, policy)).toBe(false);
});
