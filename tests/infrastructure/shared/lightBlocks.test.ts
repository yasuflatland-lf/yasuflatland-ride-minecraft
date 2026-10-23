import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isLightBlock,
  LIGHT_BLOCK,
  lightBlockId,
} from "../../../src/infrastructure/shared/lightBlocks";

describe("light blocks", () => {
  it("keeps the full-brightness block id", () => {
    expect(LIGHT_BLOCK).toBe("minecraft:light_block_15");
    expect(LIGHT_BLOCK).toBe(lightBlockId(15));
  });

  it("creates a recognized light block for every valid level", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 15 }), (n) => {
        expect(lightBlockId(n)).toBe(`minecraft:light_block_${n}`);
        expect(isLightBlock({ typeId: lightBlockId(n) })).toBe(true);
      }),
    );
  });

  it("rejects integer levels outside the allowed range", () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n < 0 || n > 15),
        (n) => {
          expect(() => lightBlockId(n)).toThrow(RangeError);
        },
      ),
    );
  });

  it("rejects non-integer levels", () => {
    fc.assert(
      fc.property(
        fc.double().filter((n) => !Number.isInteger(n)),
        (n) => {
          expect(() => lightBlockId(n)).toThrow(RangeError);
        },
      ),
    );
    expect(() => lightBlockId(Number.NaN)).toThrow(RangeError);
  });

  it("recognizes the bare light block id", () => {
    expect(isLightBlock({ typeId: "minecraft:light_block" })).toBe(true);
  });

  it.each([
    "minecraft:air",
    "minecraft:stone",
    "minecraft:light_gray_wool",
    "yasu_ride:camper_ceiling",
    "minecraft:glowstone",
  ])("does not treat %s as a light block", (typeId) => {
    expect(isLightBlock({ typeId })).toBe(false);
  });

  it("rejects every string without the light block prefix", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith("minecraft:light_block")),
        (typeId) => {
          expect(isLightBlock({ typeId })).toBe(false);
        },
      ),
    );
  });
});
