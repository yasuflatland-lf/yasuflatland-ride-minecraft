import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type DockBlock,
  refloor,
  sameBlock,
} from "../../../../src/domain/vehicle/dock/floor";
import { cellKey } from "../../../../src/domain/vehicle/lighting/headlights";
import { defined } from "../../../support/defined";

const decorBlock = fc.record({
  type: fc.constant("decor" as const),
  item: fc.constantFrom("potted_plant", "percolator"),
  face: fc.constantFrom(0, 1, 2, 3),
  height: fc.integer({ min: 0, max: 15 }),
});
const block: fc.Arbitrary<DockBlock> = fc.oneof(
  fc.record({
    type: fc.constant("deck" as const),
    height: fc.integer({ min: 1, max: 16 }),
  }),
  fc.constant({ type: "floor" as const }),
  fc.constant({ type: "ceiling" as const }),
  fc.record({
    type: fc.constant("wall" as const),
    face: fc.constantFrom(0, 1, 2, 3),
  }),
  fc.record({
    type: fc.constant("door" as const),
    face: fc.constantFrom(0, 1, 2, 3),
    open: fc.boolean(),
  }),
  decorBlock,
);
const cell = fc.record({
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
  block,
});
const cells = fc.uniqueArray(cell, { selector: cellKey });

describe("refloor (ADR 0063)", () => {
  it("clears only unwanted cells and places exactly new or changed cells", () => {
    fc.assert(
      fc.property(cells, cells, (laid, wanted) => {
        const { clear, place } = refloor(laid, wanted);
        expect(clear).toEqual(
          laid.filter((c) => !wanted.some((w) => cellKey(w) === cellKey(c))),
        );
        expect(place).toEqual(
          wanted.filter(
            (c) =>
              !laid.some(
                (l) => cellKey(l) === cellKey(c) && sameBlock(l.block, c.block),
              ),
          ),
        );
        const after = new Map(laid.map((c) => [cellKey(c), c.block]));
        for (const c of clear) after.delete(cellKey(c));
        for (const c of place) after.set(cellKey(c), c.block);
        expect(after).toEqual(
          new Map(wanted.map((c) => [cellKey(c), c.block])),
        );
      }),
    );
  });

  it("does no work for an unchanged dock, regardless of cell order", () => {
    fc.assert(
      fc.property(cells, (laid) => {
        expect(refloor(laid, [...laid].reverse())).toEqual({
          clear: [],
          place: [],
        });
      }),
    );
  });

  it("replaces cells whose blocks differ without clearing them", () => {
    fc.assert(
      fc.property(cells, block, (laid, replacement) => {
        const wanted = laid.map((c) => ({ ...c, block: replacement }));
        expect(refloor(laid, wanted)).toEqual({
          clear: [],
          place: wanted.filter(
            (c, i) => !sameBlock(c.block, defined(laid[i], "laid cell").block),
          ),
        });
      }),
    );
  });

  it("changes only the door when its open state changes", () => {
    fc.assert(
      fc.property(
        cell,
        fc.boolean(),
        fc.constantFrom(0, 1, 2, 3),
        (at, open, face) => {
          const door = { ...at, block: { type: "door" as const, face, open } };
          const floor = {
            ...at,
            x: at.x + 1,
            block: { type: "floor" as const },
          };
          const wanted = { ...door, block: { ...door.block, open: !open } };
          expect(refloor([door, floor], [wanted, floor])).toEqual({
            clear: [],
            place: [wanted],
          });
        },
      ),
    );
  });
});

describe("sameBlock", () => {
  it("is reflexive and symmetric and rejects different types", () => {
    fc.assert(
      fc.property(block, block, (a, b) => {
        expect(sameBlock(a, a)).toBe(true);
        expect(sameBlock(a, b)).toBe(sameBlock(b, a));
        if (a.type !== b.type) expect(sameBlock(a, b)).toBe(false);
      }),
    );
  });

  it("tells decor apart by item, face, and height", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(decorBlock, decorBlock),
          decorBlock.map((a) => [a, { ...a }] as const),
        ),
        ([a, b]) => {
          expect(sameBlock(a, b)).toBe(
            a.item === b.item && a.face === b.face && a.height === b.height,
          );
        },
      ),
    );
  });
});
