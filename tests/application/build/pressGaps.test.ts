import fc from "fast-check";
import { expect, it } from "vitest";
import { PressGaps } from "../../../src/application/build/pressGaps";
import { asPlayerId } from "../../../src/domain/shared/ids";

it("tracks the most recent press per player and clears the gap on forget", () => {
  fc.assert(
    fc.property(
      fc.nat(),
      fc.array(fc.nat(), { minLength: 2 }),
      (start, gaps) => {
        const tracker = new PressGaps();
        const a = asPlayerId("a");
        const b = asPlayerId("b");
        let tick = start;
        expect(tracker.note(a, tick)).toBe(Number.POSITIVE_INFINITY);
        for (const gap of gaps) {
          tracker.note(b, tick);
          tick += gap;
          expect(tracker.note(a, tick)).toBe(gap);
        }
        tracker.forget(a);
        expect(tracker.note(a, tick)).toBe(Number.POSITIVE_INFINITY);
        expect(tracker.note(b, tick)).toBe(gaps.at(-1));
      },
    ),
  );
});
