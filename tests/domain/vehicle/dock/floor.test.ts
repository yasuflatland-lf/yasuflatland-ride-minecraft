import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type DockBlock,
  type DockCell,
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
  spot: fc.integer({ min: 0, max: 4 }),
});
const pairEnd = fc.option(fc.constantFrom("cushion", "toaster"), {
  nil: undefined,
});
const decorPairBlock = fc
  .record({
    pair: fc.constantFrom("shelf" as const, "table" as const),
    face: fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const),
    height: fc.constantFrom(4, 10, 12),
    end0: pairEnd,
    end1: pairEnd,
  })
  .map(({ end0, end1, ...rest }) => ({
    type: "decorPair" as const,
    ...rest,
    ...(end0 === undefined ? {} : { end0 }),
    ...(end1 === undefined ? {} : { end1 }),
  }));
const furnitureHeight = fc.integer({ min: 0, max: 15 });
const showerToiletFace = fc.constantFrom(0, 1, 2, 3);
const block: fc.Arbitrary<DockBlock> = fc.oneof(
  fc.record({
    type: fc.constant("deck" as const),
    height: fc.integer({ min: 1, max: 16 }),
  }),
  fc.constant({ type: "floor" as const }),
  fc.constant({ type: "ceiling" as const }),
  fc.constant({ type: "bed" as const }),
  furnitureHeight.map((height) => ({ type: "furniture" as const, height })),
  fc.record({
    type: fc.constant("wall" as const),
    face: fc.constantFrom(0, 1, 2, 3),
  }),
  fc.record({
    type: fc.constant("door" as const),
    face: fc.constantFrom(0, 1, 2, 3),
    open: fc.boolean(),
  }),
  showerToiletFace.map((face) => ({ type: "showerToilet" as const, face })),
  decorBlock,
  decorPairBlock,
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

  it("places a laid cell again exactly when the lost predicate reports it, and clears the same cells (ADR 0096)", () => {
    fc.assert(
      fc.property(
        cells,
        cells,
        fc.func(fc.boolean()),
        (laid, wanted, isLost) => {
          const { clear, place } = refloor(laid, wanted, isLost);
          expect(clear).toEqual(refloor(laid, wanted).clear);
          expect(place).toEqual(
            wanted.filter((c) => {
              const l = laid.find((x) => cellKey(x) === cellKey(c));
              return (
                l === undefined || !sameBlock(l.block, c.block) || isLost(l)
              );
            }),
          );
        },
      ),
    );
  });

  it("asks the lost predicate only about laid cells (ADR 0096)", () => {
    fc.assert(
      fc.property(cells, cells, (laid, wanted) => {
        const asked: DockCell[] = [];
        refloor(laid, wanted, (c) => {
          asked.push(c);
          return true;
        });
        for (const arg of asked) expect(laid.includes(arg)).toBe(true);
      }),
    );
  });

  it("places again every laid cell that is lost, and nothing else, for an unchanged dock (ADR 0096)", () => {
    fc.assert(
      fc.property(cells, fc.array(fc.boolean()), (laid, flags) => {
        const lostKeys = new Set(
          laid.filter((_, i) => flags[i] === true).map(cellKey),
        );
        expect(refloor(laid, laid, (c) => lostKeys.has(cellKey(c)))).toEqual({
          clear: [],
          place: laid.filter((c) => lostKeys.has(cellKey(c))),
        });
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

  it("tells decor apart by item, face, height, and spot (ADR 0107)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(decorBlock, decorBlock),
          decorBlock.map((a) => [a, { ...a }] as const),
        ),
        ([a, b]) => {
          expect(sameBlock(a, b)).toBe(
            a.item === b.item &&
              a.face === b.face &&
              a.height === b.height &&
              a.spot === b.spot,
          );
        },
      ),
    );
  });

  it("tells pair blocks apart by furniture, face, height, and the item at each end (ADR 0108)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(decorPairBlock, decorPairBlock),
          decorPairBlock.map((a) => [a, { ...a }] as const),
        ),
        decorBlock,
        ([a, b], decor) => {
          expect(sameBlock(a, b)).toBe(
            a.pair === b.pair &&
              a.face === b.face &&
              a.height === b.height &&
              a.end0 === b.end0 &&
              a.end1 === b.end1,
          );
          expect(sameBlock(a, decor)).toBe(false);
        },
      ),
    );
  });

  it("tells shower-toilet blocks apart by face only (ADR 0098)", () => {
    fc.assert(
      fc.property(showerToiletFace, showerToiletFace, block, (a, b, other) => {
        const showerToilet = { type: "showerToilet", face: a } as const;
        expect(sameBlock(showerToilet, { type: "showerToilet", face: b })).toBe(
          a === b,
        );
        expect(sameBlock(showerToilet, other)).toBe(
          other.type === "showerToilet" && other.face === a,
        );
      }),
    );
  });

  it("tells furniture apart by height (ADR 0097)", () => {
    fc.assert(
      fc.property(
        furnitureHeight,
        furnitureHeight,
        decorBlock,
        (a, b, decor) => {
          const furniture = { type: "furniture", height: a } as const;
          expect(sameBlock(furniture, { type: "furniture", height: b })).toBe(
            a === b,
          );
          expect(sameBlock(furniture, decor)).toBe(false);
          expect(sameBlock(furniture, { type: "bed" })).toBe(false);
          expect(sameBlock({ type: "bed" }, furniture)).toBe(false);
        },
      ),
    );
  });
});
