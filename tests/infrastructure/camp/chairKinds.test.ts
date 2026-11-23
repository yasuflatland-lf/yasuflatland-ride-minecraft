import { describe, expect, it } from "vitest";
import {
  CHAIR_KIND_BY_TEST_EVENT,
  CHAIR_KINDS,
} from "../../../src/infrastructure/camp/identifiers";

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

  it("routes the original Low Chair hit command (ADR 0122)", () => {
    expect(CHAIR_KIND_BY_TEST_EVENT.get("yasu_ride:test_chair_hit")).toBe(
      "low_chair",
    );
  });
});
