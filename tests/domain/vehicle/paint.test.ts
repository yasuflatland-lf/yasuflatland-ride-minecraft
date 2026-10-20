import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  effectivePaint,
  PAINTS,
} from "../../../src/domain/vehicle/paint/paint";

describe("effectivePaint (ADR 0076)", () => {
  it("the variant-0 slot shows the default", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (def) => {
        expect(effectivePaint(PAINTS[0], def)).toBe(def);
      }),
    );
  });

  it("any other paint shows itself", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PAINTS.slice(1)),
        fc.constantFrom(...PAINTS),
        (p, def) => {
          expect(effectivePaint(p, def)).toBe(p);
        },
      ),
    );
  });
});
