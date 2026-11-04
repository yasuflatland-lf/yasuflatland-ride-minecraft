import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHAIR_KINDS } from "../../../src/infrastructure/camp/identifiers";

describe("chair kind identifiers", () => {
  it("keeps every identifier distinct across kinds", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "typeId",
          "itemId",
          "family",
          "hitsHint",
          "testHitEvent",
        ),
        (field) => {
          const values = Object.values(CHAIR_KINDS).map(
            (profile) => profile[field],
          );
          expect(new Set(values).size).toBe(values.length);
        },
      ),
    );
  });

  it("preserves the Low Chair's existing identifiers", () => {
    expect(CHAIR_KINDS.low_chair.typeId).toBe("yasu_ride:low_chair");
    expect(CHAIR_KINDS.low_chair.itemId).toBe("yasu_ride:low_chair_item");
    expect(CHAIR_KINDS.low_chair.family).toBe("yasu_ride_low_chair");
    expect(CHAIR_KINDS.low_chair.hitsHint).toBe(
      "yasu_ride.hint.low_chair_hits",
    );
    expect(CHAIR_KINDS.low_chair.testHitEvent).toBe("yasu_ride:test_chair_hit");
  });
});
