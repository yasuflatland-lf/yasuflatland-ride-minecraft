import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type DecorItemId,
  type DecorSlotId,
  decorFace,
  isDecorItem,
  parseDecor,
  parseDecorSlotId,
  serializeDecor,
} from "../../../../src/domain/vehicle/dock/decor";
import { decorItemId, decorSlotId } from "../../../support/decorIds";

const decorList = (minLength: number) =>
  fc.array(
    fc.record({
      slot: fc.string().map(decorSlotId),
      item: fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/).map(decorItemId),
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
        if (isDecorItem(raw)) expectTypeOf(raw).toEqualTypeOf<DecorItemId>();
      }),
    );
    expectTypeOf<string>().not.toExtend<DecorSlotId>();
    expectTypeOf<string>().not.toExtend<DecorItemId>();
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
    42,
    true,
  ])("reads malformed saved decor as no decor: %s", (saved) => {
    expect(parseDecor(saved)).toEqual([]);
  });

  it("keeps every entry of a repeated slot", () => {
    expect(
      parseDecor('[{"slot":"table","item":"a"},{"slot":"table","item":"b"}]'),
    ).toEqual([
      { slot: "table", item: "a" },
      { slot: "table", item: "b" },
    ]);
  });

  it("turns any yaw near a quarter into that quarter", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        fc.double({ min: -44, max: 44, noNaN: true }),
        (k, o) => {
          expect(decorFace(k * 90 + o)).toBe(((k % 4) + 4) % 4);
        },
      ),
    );
    expect([0, 90, 180, -180, -90, 270].map(decorFace)).toEqual([
      0, 1, 2, 2, 3, 3,
    ]);
  });

  it("accepts only snake_case item ids", () => {
    expect(isDecorItem("potted_plant")).toBe(true);
    expect(isDecorItem("mug_pair")).toBe(true);
    for (const bad of ["", "Potted", "2mugs", "a-b", "yasu_ride:mug_pair"])
      expect(isDecorItem(bad)).toBe(false);
  });
});
