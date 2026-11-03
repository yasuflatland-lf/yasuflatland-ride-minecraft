import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { approach, normalizeYaw } from "../../../../src/domain/shared/vec";
import {
  SUV_SPEC,
  SUV_TRANSFORMING,
} from "../../../../src/domain/vehicle/kinds/suv/spec";
import { bankSink, stepBank } from "../../../../src/domain/vehicle/motion/bank";
import { FORMS } from "../../../../src/domain/vehicle/motion/forms";

const constant = { ...SUV_TRANSFORMING, bankEasing: "constant" as const };

const angle = fc.double({
  min: -SUV_SPEC.maxBank,
  max: SUV_SPEC.maxBank,
  noNaN: true,
});
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const turn = fc
  .double({ min: -3, max: 3, noNaN: true })
  .map((t) => t * SUV_SPEC.turnRate);
const form = fc.constantFrom(...FORMS);
// Forms that roll into turns: flight (ADR 0026) and the submarine (ADR 0044).
const BANKING = ["hover", "submarine"] as const;
const banking = fc.constantFrom(...BANKING);

describe("stepBank (ADR 0026, 0044)", () => {
  it("moves at most bankRate per tick and stays within maxBank", () => {
    fc.assert(
      fc.property(angle, form, yaw, turn, (prev, m, y, d) => {
        const next = stepBank(prev, m, y, y + d, SUV_SPEC.turnRate, constant);
        expect(Math.abs(next - prev)).toBeLessThanOrEqual(
          SUV_SPEC.bankRate + 1e-9,
        );
        expect(Math.abs(next)).toBeLessThanOrEqual(SUV_SPEC.maxBank + 1e-9);
      }),
    );
  });

  it("banks toward the turn in hover and submarine form: right side down when the heading turns right (yaw increases)", () => {
    fc.assert(
      fc.property(
        banking,
        yaw,
        fc.double({ min: 0.1, max: 20, noNaN: true }),
        (m, y, d) => {
          expect(
            stepBank(0, m, y, y + d, SUV_SPEC.turnRate, SUV_TRANSFORMING),
          ).toBeGreaterThan(0);
          expect(
            stepBank(0, m, y, y - d, SUV_SPEC.turnRate, SUV_TRANSFORMING),
          ).toBeLessThan(0);
        },
      ),
    );
  });

  it("measures the turn across the ±180° wrap", () => {
    expect(
      stepBank(0, "hover", 178, -178, SUV_SPEC.turnRate, SUV_TRANSFORMING),
    ).toBeGreaterThan(0);
    expect(
      stepBank(0, "hover", -178, 178, SUV_SPEC.turnRate, SUV_TRANSFORMING),
    ).toBeLessThan(0);
  });

  it("settles at maxBank for a turn at the full turn rate", () => {
    for (const m of BANKING) {
      let bank = 0;
      for (let t = 0; t < 30; t++)
        bank = stepBank(
          bank,
          m,
          0,
          SUV_SPEC.turnRate,
          SUV_SPEC.turnRate,
          SUV_TRANSFORMING,
        );
      expect(bank, m).toBe(SUV_SPEC.maxBank);
    }
  });

  it("settles at a bank in proportion to a steady turn, full bank at the full turn rate", () => {
    fc.assert(
      fc.property(
        banking,
        yaw,
        fc.integer({ min: -10, max: 10 }),
        (m, y, tenths) => {
          const share = tenths / 10;
          let bank = 0;
          for (let t = 0; t < 30; t++)
            bank = stepBank(
              bank,
              m,
              y,
              normalizeYaw(y + share * SUV_SPEC.turnRate),
              SUV_SPEC.turnRate,
              SUV_TRANSFORMING,
            );
          expect(bank).toBeCloseTo(share * SUV_SPEC.maxBank, 9);
        },
      ),
    );
  });

  it("levels out when the turn stops or the vehicle is not flying or submerged", () => {
    fc.assert(
      fc.property(angle, form, yaw, turn, (start, m, y, d) => {
        let bank = start;
        const level = (BANKING as readonly string[]).includes(m) ? 0 : d;
        const ticks = Math.ceil((2 * SUV_SPEC.maxBank) / SUV_SPEC.bankRate);
        for (let t = 0; t < ticks; t++)
          bank = stepBank(
            bank,
            m,
            y,
            y + level,
            SUV_SPEC.turnRate,
            SUV_TRANSFORMING,
          );
        expect(bank).toBe(0);
      }),
    );
  });
});

describe("bankSink (ADR 0026)", () => {
  // A submarine holds its depth through a banked turn: buoyancy and the
  // climb input set its vertical speed instead (ADR 0044).
  it("sinks only while flying, more the steeper the bank, up to bankSink at full bank", () => {
    fc.assert(
      fc.property(angle, angle, form, (a, b, m) => {
        const sink = bankSink(m, a, SUV_TRANSFORMING);
        if (m !== "hover") {
          expect(sink).toBe(0);
          return;
        }
        expect(sink).toBeGreaterThanOrEqual(0);
        expect(sink).toBeLessThanOrEqual(SUV_SPEC.bankSink + 1e-12);
        if (Math.abs(a) < Math.abs(b))
          expect(sink).toBeLessThanOrEqual(bankSink(m, b, SUV_TRANSFORMING));
      }),
    );
  });

  it("holds altitude when level", () => {
    expect(bankSink("hover", 0, SUV_TRANSFORMING)).toBe(0);
  });

  it("sinks bankSink at full bank either way and half of it at half bank", () => {
    expect(bankSink("hover", SUV_SPEC.maxBank, SUV_TRANSFORMING)).toBeCloseTo(
      SUV_SPEC.bankSink,
      12,
    );
    expect(bankSink("hover", -SUV_SPEC.maxBank, SUV_TRANSFORMING)).toBeCloseTo(
      SUV_SPEC.bankSink,
      12,
    );
    expect(
      bankSink("hover", SUV_SPEC.maxBank / 2, SUV_TRANSFORMING),
    ).toBeCloseTo(SUV_SPEC.bankSink / 2, 12);
  });
});

describe("a kind without a bank (maxBank 0)", () => {
  const level = { ...SUV_TRANSFORMING, maxBank: 0 };

  it("never sinks in any form at any bank angle", () => {
    fc.assert(
      fc.property(form, angle, (m, a) => {
        expect(bankSink(m, a, level)).toBe(0);
      }),
    );
  });

  it("stays exactly level through any turn in any form", () => {
    fc.assert(
      fc.property(form, yaw, turn, (m, y, d) => {
        expect(stepBank(0, m, y, y + d, SUV_SPEC.turnRate, level)).toBe(0);
      }),
    );
  });
});

describe("per-kind bank limits", () => {
  it("respects the supplied maxBank and bankRate from an angle within bounds", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 60, noNaN: true }),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        form,
        yaw,
        turn,
        (maxBank, bankRate, share, form, yaw, turn) => {
          const spec = { ...constant, maxBank, bankRate };
          const prev = share * maxBank;
          const next = stepBank(
            prev,
            form,
            yaw,
            yaw + turn,
            SUV_SPEC.turnRate,
            spec,
          );
          expect(Math.abs(next)).toBeLessThanOrEqual(maxBank + 1e-9);
          expect(Math.abs(next - prev)).toBeLessThanOrEqual(bankRate + 1e-9);
        },
      ),
    );
  });

  it("banks fully at whatever full turn rate it is given", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), banking, (rate, m) => {
        let bank = 0;
        for (let t = 0; t < 30; t++)
          bank = stepBank(bank, m, 0, rate, rate, SUV_TRANSFORMING);
        expect(bank).toBe(SUV_SPEC.maxBank);
      }),
    );
  });
});

describe("smooth bank easing (ADR 0213)", () => {
  it("never overshoots or moves away and reaches any steady target within bounded ticks", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 90, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.integer({ min: -100, max: 100 }),
        banking,
        (maxBank, bankRate, prev, turn, form) => {
          const spec = { ...SUV_TRANSFORMING, maxBank, bankRate };
          const target = (turn / 100) * maxBank || 0;
          const bound = Math.ceil(Math.abs(target - prev) / 0.75) + 1;
          let bank = prev;
          for (let tick = 0; tick < bound && bank !== target; tick++) {
            const next = stepBank(bank, form, 0, turn, 100, spec);
            expect(next).toBeGreaterThanOrEqual(Math.min(bank, target));
            expect(next).toBeLessThanOrEqual(Math.max(bank, target));
            expect(Math.abs(next - target)).toBeLessThan(
              Math.abs(bank - target),
            );
            bank = next;
          }
          expect(bank === target).toBe(true);
        },
      ),
    );
  });

  it("reaches full SUV bank in 10 to 13 ticks with slower entry and exit", () => {
    fc.assert(
      fc.property(banking, fc.constantFrom(-1, 1), (form, direction) => {
        let bank = 0;
        const steps: number[] = [];
        const target = direction * SUV_SPEC.maxBank;
        while (bank !== target && steps.length < 14) {
          const next = stepBank(bank, form, 0, direction, 1, SUV_TRANSFORMING);
          steps.push(Math.abs(next - bank));
          bank = next;
        }
        expect(bank === target).toBe(true);
        expect(steps.length).toBeGreaterThanOrEqual(10);
        expect(steps.length).toBeLessThanOrEqual(13);
        expect(steps[0]).toBe(1.5);
        expect(steps[1]).toBeGreaterThan(1.5);
        const peak = Math.max(...steps);
        expect(peak).toBeGreaterThan(SUV_SPEC.bankRate);
        expect(steps.at(-2)).toBeLessThan(peak);
        expect(steps.at(-1)).toBeLessThanOrEqual(0.75);
      }),
    );
  });

  it("preserves the constant profile for arbitrary rates and targets", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 90, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        angle,
        fc.integer({ min: -100, max: 100 }),
        form,
        (maxBank, bankRate, prev, turn, form) => {
          const spec = { ...constant, maxBank, bankRate };
          const target = BANKING.some((m) => m === form)
            ? (turn / 100) * maxBank
            : 0;
          expect(stepBank(prev, form, 0, turn, 100, spec)).toBe(
            approach(prev, target, bankRate),
          );
        },
      ),
    );
  });
});
