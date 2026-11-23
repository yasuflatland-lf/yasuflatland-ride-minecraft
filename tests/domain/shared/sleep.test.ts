import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canSleep, SLEEP } from "../../../src/domain/shared/sleep";

describe("canSleep (ADR 0092)", () => {
  it("allows sleeping exactly from 12542 to 23459", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23999 }), (t) => {
        expect(canSleep(t)).toBe(t >= 12542 && t <= 23459);
      }),
      { examples: [[12541], [12542], [23459], [23460]] },
    );
  });

  it("does not let the player sleep again right after waking", () => {
    expect(canSleep(SLEEP.wakeTime)).toBe(false);
  });
});
