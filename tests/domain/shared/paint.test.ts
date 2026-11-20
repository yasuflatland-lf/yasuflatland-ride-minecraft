import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dyeable,
  effectivePaint,
  fixed,
  isDyeable,
  PAINT_EVENT_PREFIX,
  PAINTS,
  paintEventName,
} from "../../../src/domain/shared/paint";

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

it("preserves the saved variant order", () => {
  expect([...PAINTS]).toEqual([
    "khaki",
    "green",
    "red",
    "white",
    "light_gray",
    "gray",
    "black",
    "orange",
    "yellow",
    "lime",
    "cyan",
    "light_blue",
    "blue",
    "purple",
    "magenta",
    "pink",
  ]);
});

it("builds every paint event with the reserved prefix", () => {
  expect(PAINT_EVENT_PREFIX).toBe("paint_");
  fc.assert(
    fc.property(fc.constantFrom(...PAINTS), (paint) => {
      expect(paintEventName(paint)).toBe(PAINT_EVENT_PREFIX + paint);
    }),
  );
});

describe("paint policies", () => {
  it("recognizes dyeable and fixed policies for every paint", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (paint) => {
        expect(isDyeable(dyeable(paint))).toBe(true);
        expect(isDyeable(fixed(paint))).toBe(false);
      }),
    );
  });
});
