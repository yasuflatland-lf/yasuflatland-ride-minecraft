import { describe, expect, it } from "vitest";
import {
  CHAIR_KINDS,
  TEST_LOW_CHAIR_HIT_EVENT,
} from "../../../src/infrastructure/camp/identifiers";

describe("chair kind identifiers", () => {
  it.each(["typeId", "itemId", "family", "hitsHint"] as const)(
    "keeps %s distinct across chair kinds",
    (field) => {
      const values = Object.values(CHAIR_KINDS).map(
        (profile) => profile[field],
      );
      expect(new Set(values).size).toBe(values.length);
    },
  );

  it("keeps the original Low Chair hit command (ADR 0122)", () => {
    expect(TEST_LOW_CHAIR_HIT_EVENT).toBe("yasu_ride:test_chair_hit");
  });
});
