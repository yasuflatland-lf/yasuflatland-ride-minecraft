import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { quarterOf } from "../../../../../src/domain/shared/facing";
import {
  CAMPING_GEAR_IDS,
  type CampingGearId,
} from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import {
  type DecorItemId,
  type DecorSlotId,
  parseDecor,
  parseDecorSlotId,
  serializeDecor,
} from "../../../../../src/domain/vehicle/kinds/camper/decorData";
import { decorSlotId } from "../../../../support/decorIds";

const decorList = (minLength: number) =>
  fc.array(
    fc.record({
      slot: fc.string().map(decorSlotId),
      item: fc.constantFrom(...CAMPING_GEAR_IDS),
    }),
    { minLength },
  );

describe("decor (ADR 0093)", () => {
  it("preserves every saved slot string while keeping slot and item types distinct", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const slot = parseDecorSlotId(raw);
        expect(slot).toBe(raw);
        expectTypeOf(slot).toEqualTypeOf<DecorSlotId | undefined>();
      }),
    );
    expectTypeOf<string>().not.toExtend<DecorSlotId>();
    expectTypeOf<DecorItemId>().toEqualTypeOf<CampingGearId>();
    expectTypeOf<DecorSlotId>().not.toExtend<DecorItemId>();
    expectTypeOf<DecorItemId>().not.toExtend<DecorSlotId>();
  });

  it("round-trips any decor through the saved string", () => {
    fc.assert(
      fc.property(decorList(1), (d) => {
        expect(parseDecor(serializeDecor(d))).toEqual(d);
      }),
    );
    expect(serializeDecor([])).toBeUndefined();
    expect(parseDecor(undefined)).toEqual([]);
  });

  it.each([
    "{",
    "{}",
    "[1]",
    '[{"slot":"table"}]',
    '[{"slot":"table","item":"Bad Item"}]',
    '[{"slot":3,"item":"mug_pair"}]',
    '[{"slot":"table","item":"unknown_gear"}]',
    '[{"slot":"table","item":"lava_lamp"}]',
    42,
    true,
  ])("reads malformed saved decor as no decor: %s", (saved) => {
    expect(parseDecor(saved)).toEqual([]);
  });

  it("keeps every entry of a repeated slot", () => {
    expect(
      parseDecor(
        '[{"slot":"table","item":"mug_pair"},{"slot":"table","item":"tissue_box"}]',
      ),
    ).toEqual([
      { slot: "table", item: "mug_pair" },
      { slot: "table", item: "tissue_box" },
    ]);
  });

  it("turns any yaw near a quarter into that quarter", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        fc.double({ min: -44, max: 44, noNaN: true }),
        (k, o) => {
          expect(quarterOf(k * 90 + o)).toBe(((k % 4) + 4) % 4);
        },
      ),
    );
    expect([0, 90, 180, -180, -90, 270].map(quarterOf)).toEqual([
      0, 1, 2, 2, 3, 3,
    ]);
  });
});
