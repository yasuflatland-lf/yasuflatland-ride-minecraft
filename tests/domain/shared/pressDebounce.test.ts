import fc from "fast-check";
import { expect, it } from "vitest";
import {
  PressDebounce,
  PressDebounces,
} from "../../../src/domain/shared/pressDebounce";

it("accepts the first use at tick zero and a new press at the exact boundary", () => {
  const debounce = new PressDebounce(10);
  expect(debounce.press(0)).toBe(true);
  expect(debounce.press(0)).toBe(false);
  expect(debounce.press(10)).toBe(true);
});

it("counts a use exactly when the gap from the previous use reaches the window", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }),
      fc.array(fc.nat({ max: 200 }), { minLength: 1 }),
      (window, gaps) => {
        const debounce = new PressDebounce(window);
        let tick = 0;
        expect(debounce.press(tick)).toBe(true);
        for (const gap of gaps) {
          tick += gap;
          expect(debounce.press(tick)).toBe(gap >= window);
        }
      },
    ),
  );
});

it("keeps mobile repeats in one press, including ignored uses", () => {
  const debounce = new PressDebounce(10);
  expect([0, 4, 10, 15, 24, 34].map((tick) => debounce.press(tick))).toEqual([
    true,
    false,
    false,
    false,
    false,
    true,
  ]);
});

it("isolates players and forgets a disconnected player's press", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 100 }), fc.nat(), (window, tick) => {
      const debounces = new PressDebounces<string>(window);
      expect(debounces.press("a", tick)).toBe(true);
      expect(debounces.press("b", tick)).toBe(true);
      debounces.remove("a");
      expect(debounces.press("a", tick)).toBe(true);
      expect(debounces.press("b", tick)).toBe(false);
    }),
  );
});
