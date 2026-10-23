import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canSleep, SLEEP } from "../../../src/domain/shared/sleep";

describe("canSleep (ADR 0092)", () => {
  it("allows sleeping exactly from 12542 to 23459", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23999 }), (t) => {
        expect(canSleep(t)).toBe(t >= 12542 && t <= 23459);
      }),
    );
  });

  it.each([
    [12541, false],
    [12542, true],
    [23459, true],
    [23460, false],
  ])("returns %s -> %s at the edges of the night", (t, expected) => {
    expect(canSleep(t)).toBe(expected);
  });

  it("does not let the player sleep again right after waking", () => {
    expect(canSleep(SLEEP.wakeTime)).toBe(false);
  });

  it("changes the time when the fade-in ends", () => {
    expect(SLEEP.wakeDelayTicks).toBe(SLEEP.fadeInSeconds * 20);
  });
});
