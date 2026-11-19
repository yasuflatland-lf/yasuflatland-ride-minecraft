import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import {
  stairDescending,
  stairFlatTop,
  stairMaterialOf,
} from "../../../src/domain/build/stair";

const stateValue = fc.oneof(fc.integer(), fc.boolean(), fc.string());
const stairState = fc
  .tuple(
    fc.string(),
    fc.dictionary(fc.string(), stateValue),
    fc.integer(),
    fc.boolean(),
  )
  .map(([typeId, extra, direction, upsideDown]) =>
    blockStateOf(typeId, {
      ...extra,
      weirdo_direction: direction,
      upside_down_bit: upsideDown,
    }),
  );

describe("stair material", () => {
  it("accepts any type ID with both stair states", () => {
    fc.assert(
      fc.property(stairState, (material) => {
        expect(stairMaterialOf(material)).toEqual({ material });
      }),
    );
  });

  it("rejects missing or mistyped stair states even on a stairs ID", () => {
    const states = fc
      .record(
        { weirdo_direction: stateValue, upside_down_bit: stateValue },
        { requiredKeys: [] },
      )
      .filter(
        (s) =>
          typeof s.weirdo_direction !== "number" ||
          typeof s.upside_down_bit !== "boolean",
      );
    fc.assert(
      fc.property(states, (invalid) => {
        expect(
          stairMaterialOf(blockStateOf("minecraft:oak_stairs", invalid)),
        ).toBeUndefined();
      }),
    );
  });

  it("descends in each requested direction and preserves all other states", () => {
    const expected = { east: 1, west: 0, south: 3, north: 2 };
    fc.assert(
      fc.property(stairState, (material) => {
        for (const toward of FACINGS) {
          expect(stairDescending({ material }, toward)).toEqual(
            blockStateOf(material.typeId, {
              ...material.states,
              weirdo_direction: expected[toward],
              upside_down_bit: false,
            }),
          );
        }
      }),
    );
  });

  it("sets a flat top while preserving the original direction and other states", () => {
    fc.assert(
      fc.property(stairState, (material) => {
        expect(stairFlatTop({ material })).toEqual(
          blockStateOf(material.typeId, {
            ...material.states,
            upside_down_bit: true,
          }),
        );
      }),
    );
  });
});
