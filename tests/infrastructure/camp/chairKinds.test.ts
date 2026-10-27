import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CHAIR_FAMILY,
  CHAIR_KINDS,
  HITS_LEFT_HINT,
  LOW_CHAIR_ITEM,
  LOW_CHAIR_TYPE,
  TEST_CHAIR_HIT_EVENT,
} from "../../../src/infrastructure/camp/identifiers";

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
    expect(LOW_CHAIR_TYPE).toBe("yasu_ride:low_chair");
    expect(LOW_CHAIR_ITEM).toBe("yasu_ride:low_chair_item");
    expect(CHAIR_FAMILY).toBe("yasu_ride_low_chair");
    expect(HITS_LEFT_HINT).toBe("yasu_ride.hint.low_chair_hits");
    expect(TEST_CHAIR_HIT_EVENT).toBe("yasu_ride:test_chair_hit");
  });
});
