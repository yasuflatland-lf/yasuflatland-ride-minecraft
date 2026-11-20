import { describe, expect, it } from "vitest";
import { CHAIR_KINDS } from "../../../src/infrastructure/camp/identifiers";

describe("chair kind identifiers", () => {
  it.each(["typeId", "itemId", "family", "hitsHint", "testHitEvent"] as const)(
    "keeps %s distinct across chair kinds",
    (field) => {
      const values = Object.values(CHAIR_KINDS).map(
        (profile) => profile[field],
      );
      expect(new Set(values).size).toBe(values.length);
    },
  );

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
