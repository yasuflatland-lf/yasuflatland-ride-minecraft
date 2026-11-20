import fc from "fast-check";
import { expect, it } from "vitest";
import { Debounce, Debounces } from "../../../src/domain/shared/debounce";

it("counts presses from the previous recorded press, including rejected presses", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }),
      fc.array(fc.nat({ max: 200 })),
      (window, gaps) => {
        const debounce = new Debounce(window);
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

it("counts a long press only once", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }),
      fc.nat({ max: 100 }),
      (window, n) => {
        const debounce = new Debounce(window);
        const gap = n % window;
        expect(debounce.press(0)).toBe(true);
        for (let i = 1; i <= 50; i++)
          expect(debounce.press(i * gap)).toBe(false);
      },
    ),
  );
});

it("press matches ready followed by record, and ready does not change state", () => {
  fc.assert(
    fc.property(
      fc.nat({ max: 100 }),
      fc.array(fc.nat({ max: 100 })),
      (window, gaps) => {
        const pressed = new Debounce(window);
        const recorded = new Debounce(window);
        let tick = 0;
        for (const gap of gaps) {
          tick += gap;
          const ready = recorded.ready(tick);
          for (let i = 0; i < gap; i++)
            expect(recorded.ready(tick)).toBe(ready);
          recorded.record(tick);
          expect(pressed.press(tick)).toBe(ready);
          expect(recorded.ready(tick)).toBe(pressed.ready(tick));
        }
      },
    ),
  );
});

type Step = { key: number; gap: number; idle: boolean };
const steps = fc.array(
  fc.record({
    key: fc.integer({ min: 0, max: 3 }),
    gap: fc.nat({ max: 15 }),
    idle: fc.boolean(),
  }),
  { maxLength: 60 },
);

it("keeps keys independent and forgetting idle keys preserves future answers", () => {
  fc.assert(
    fc.property(fc.nat({ max: 40 }), steps, (window, sequence: Step[]) => {
      const all = new Debounces<number>(window);
      const retained = new Debounces<number>(window);
      const alone = new Debounces<number>(window);
      let tick = 0;
      for (const step of sequence) {
        tick += step.gap;
        if (step.idle) all.forgetIdle(tick);
        const result = all.press(step.key, tick);
        expect(retained.press(step.key, tick)).toBe(result);
        if (step.key === 0) expect(alone.press(0, tick)).toBe(result);
      }
    }),
  );
});

it("forgets one key and supports checking and recording without a press", () => {
  const debounces = new Debounces<string>(10);
  debounces.record("a", 5);
  expect(debounces.ready("a", 14)).toBe(false);
  expect(debounces.ready("b", 14)).toBe(true);
  debounces.forget("a");
  expect(debounces.press("a", 14)).toBe(true);
  expect(debounces.ready("a", 24)).toBe(true);
});

it("rejects invalid windows", () => {
  for (const window of [-1, 0.5, Number.NaN, Infinity]) {
    expect(() => new Debounce(window)).toThrow(RangeError);
    expect(() => new Debounces(window)).toThrow(RangeError);
  }
});
